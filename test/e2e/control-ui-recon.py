#!/usr/bin/env python3
"""Taskfold Control UI 基线巡检脚本（第 1 期：UI 仍连 SQLite 后端）。

背景（需求/16-文件存储改造.md 10.2）
----------------------------------
第 1 期只是把存储层实现改成文件，**不切生产路径**（第 3 期才切），
所以本脚本此刻巡检的仍是 SQLite 后端驱动的 Control UI。它的价值不是
验证 SQLite 本身，而是把"迁移前，用户在界面上能看到什么"固化成可执行
事实——等第 3 期真的切到文件后端后，同一套脚本原样重跑，一旦某个数字、
某一列、某个字段变了，就说明"只换存储层"这件事没有做到。

因此本脚本只收集**用户可观察到的界面事实**（列名、计数、字段是否渲染、
是否有异常值），不断言任何"为什么是这个数字"的 SQLite 内部实现细节。

依赖（仅开发机可用，CI 上没有，必须能被上层测试优雅跳过）
----------------------------------------------------------
- 一个正在运行、监听 127.0.0.1:18789 的 OpenClaw Gateway，且已加载
  Taskfold 插件：http://127.0.0.1:18789/plugin?plugin=taskfold&id=taskfold
- 令牌不在本脚本内获取，也绝不写入任何文件。调用方（test/e2e/*.test.ts）
  负责先探活 Gateway、再用 `openclaw gateway auth-token --show` 现取令牌
  （非交互终端会被拒，需要伪终端，例如 `script -qec "..." /dev/null`），
  通过环境变量 TASKFOLD_E2E_TOKEN 传给本脚本。
- Playwright 解释器必须是 webapp-testing skill 自带的 venv，系统 python
  没有装 playwright：
    ~/.claude/skills/webapp-testing/.venv/bin/python control-ui-recon.py

环境变量
--------
TASKFOLD_E2E_TOKEN      必填。Gateway 令牌，仅在本进程内存中使用。
TASKFOLD_E2E_URL        可选。默认 http://127.0.0.1:18789/plugin?plugin=taskfold&id=taskfold
TASKFOLD_E2E_ARTIFACT_DIR  可选。截图落地目录，默认系统临时目录下的
                        taskfold-control-ui-e2e 子目录（不落在仓库里）。

只读边界
--------
- 不新建、编辑、删除任何卡片 / 项目 / 里程碑，不写数据库。
- 下面"分列方式 / 排序方式 / 排序方向 / 包含已归档 / 语言"这 5 个视图
  控件会被临时切换以读取另一种视图，但脚本内闭环复原，并在返回结果里
  报告是否复原成功（view_prefs_restored），供上层测试兜底断言——绝不
  留下需要人工还原的残留状态。
- "创建时间"字段：实测 Control UI 的卡片详情弹窗并**没有**直接展示
  created_date 的文本字段（既不在弹窗正文，也不在卡片面板，grep 全页
  HTML 也找不到 <time> 或相对时间渲染）。唯一能触达它的入口是"排序方式"
  切到"创建时间"，但实测这个切换在极少数时序下会导致"手工顺序"选项从
  下拉框里彻底消失且无法通过 UI 复原（本次开发过程中真实触发过一次，
  靠"分列方式切到"需求"再切回"里程碑""才刚好把它掰回来）。这个副作用
  面太大、复原不可靠，所以这里**不**对 created_date 做基于排序的验证，
  只在卡片详情断言里做"没有 Invalid Date / NaN / undefined 之类的渲染
  垃圾"这个通用兜底检查。
"""

import json
import os
import re
import sys
import tempfile

from playwright.sync_api import sync_playwright

DEFAULT_URL = "http://127.0.0.1:18789/plugin?plugin=taskfold&id=taskfold"
LOGIN_INPUT_SELECTOR = 'input[placeholder="粘贴令牌或输入密码"]'
CONNECT_BUTTON_SELECTOR = 'button:has-text("连接")'

# ProCloud 里字段最全的一张卡片：目标 / 实际完成 / 验证与预期 / 当前结论 /
# 参考资料等 markdown 分区，加上状态、优先级、负责人、交付事实等结构化字段，
# 一共覆盖 16 类字段/区块，逐条见 CARD_DETAIL_MARKERS。
PROCLOUD_SAMPLE_CARD_TEXT = "17-02 · FeishuNotifier 出站与 outbox 底座"

CARD_DETAIL_MARKERS = [
    "卡片详情",
    "## 目标",
    "## 实际完成",
    "## 验证与预期",
    "## 当前结论",
    "## 参考资料",
    "状态",
    "优先级",
    "负责人",
    "打开项目",
    "移动到",
    "执行",
    "交付事实",
    "来源资料",
    "验证证据",
    "产物",
]

# 渲染层常见的"字段映射错了"痕迹：日期解析失败、对象/数组没序列化好等。
BROKEN_VALUE_PATTERNS = [
    "Invalid Date",
    "NaN",
    "undefined",
    "[object Object]",
    "null",
]


def env_or(name: str, default: str) -> str:
    value = os.environ.get(name)
    return value if value else default


def artifact_dir() -> str:
    configured = os.environ.get("TASKFOLD_E2E_ARTIFACT_DIR")
    if configured:
        os.makedirs(configured, exist_ok=True)
        return configured
    path = os.path.join(tempfile.gettempdir(), "taskfold-control-ui-e2e")
    os.makedirs(path, exist_ok=True)
    return path


def login(page, token: str) -> None:
    """打开插件页并在需要时用令牌登录。第一次加载在拿到令牌页面前允许等
    networkidle——这时还没有登录，也就没有那条常开 WebSocket，所以不会像
    登录后那样卡满 30s。"""
    page.goto(env_or("TASKFOLD_E2E_URL", DEFAULT_URL))
    page.wait_for_load_state("networkidle")

    login_input = page.locator(LOGIN_INPUT_SELECTOR)
    if login_input.count() > 0 and login_input.first.is_visible():
        login_input.first.fill(token)
        page.click(CONNECT_BUTTON_SELECTOR)
        # 登录后有常开 WebSocket，networkidle 会稳定超时，这里改用固定等待。
        page.wait_for_timeout(3000)

    body = page.inner_text("body")
    if "粘贴令牌" in body or "此 Gateway 需要令牌" in body:
        raise RuntimeError("登录后页面仍显示令牌输入提示，登录可能失败")


def get_badge_total(page):
    """"全部项目" 徽标：不受"包含已归档"勾选框影响的项目总数。"""
    text = page.evaluate(
        """
        () => {
          const all = Array.from(document.querySelectorAll('*'));
          for (const el of all) {
            if (el.textContent.trim() === '全部项目') {
              const parent = el.parentElement;
              return parent ? parent.textContent.trim() : null;
            }
          }
          return null;
        }
        """
    )
    if not text:
        return None
    match = re.search(r"(\d+)", text)
    return int(match.group(1)) if match else None


def get_visible_project_card_count(page) -> int:
    return page.locator("text=张卡片").count()


def get_sidebar_project_counts(page):
    """项目列表里每个项目卡片（<article>）上的"N 张卡片"计数，按已知的三个
    展示名（ProCloud / Taskfold / default）归类；fb-probe 默认被归档过滤掉，
    不会出现在这里（这正是要固化的归档过滤行为）。"""
    articles = page.evaluate(
        """
        () => Array.from(document.querySelectorAll('article'))
          .map(a => a.textContent)
          .filter(t => /张卡片/.test(t))
        """
    )
    counts = {}
    for text in articles:
        match = re.search(r"(\d+)\s*张卡片", text)
        if not match:
            continue
        count = int(match.group(1))
        for name in ("ProCloud", "Taskfold", "default", "fb-probe"):
            if name in text:
                counts[name] = count
                break
    return counts


def read_view_prefs(page):
    lang = page.locator("select").nth(0)
    groupby = page.locator("select").nth(1)
    sortby = page.locator("select").nth(2)
    sortdir = page.locator("select").nth(3)
    archive = page.locator('input[type="checkbox"]').first
    return {
        "lang": lang.input_value(),
        "groupBy": groupby.input_value(),
        "sortBy": sortby.input_value(),
        "sortDir": sortdir.input_value(),
        "archiveChecked": archive.is_checked(),
    }


def restore_view_prefs(page, original) -> bool:
    """把分列方式 / 排序方式 / 排序方向 / 语言 复原成传入的原始值。

    已知坑：把"分列方式"切到"状态"或"需求"后，"排序方式"下拉里的选项
    集合会变（没有"手工顺序"），如果当时排序方式恰好是"手工顺序"，浏览器
    会自动把它 fallback 成下拉里剩下的第一个选项——这个 fallback 有极小
    概率黏住，切回原分列方式也不会自动恢复。这里做两层兜底：
      1. 直接切回原分列方式后，如果排序方式已经对上，直接返回。
      2. 对不上时，尝试直接重选原排序方式（如果它还在选项里）。
      3. 还不行的话，在"分列方式"上多绕一圈（milestone -> requirement ->
         milestone）——这是本脚本开发过程中实测能把状态掰回来的路径。
    三层都失败就如实报告 False，交给上层测试当真失败处理，而不是假装成功。
    """
    groupby = page.locator("select").nth(1)
    sortby = page.locator("select").nth(2)
    sortdir = page.locator("select").nth(3)
    lang = page.locator("select").nth(0)

    groupby.select_option(original["groupBy"])
    page.wait_for_timeout(800)

    def matches() -> bool:
        current = read_view_prefs(page)
        return (
            current["groupBy"] == original["groupBy"]
            and current["sortBy"] == original["sortBy"]
            and current["sortDir"] == original["sortDir"]
        )

    if not matches():
        available = [
            sortby.locator("option").nth(i).get_attribute("value")
            for i in range(sortby.locator("option").count())
        ]
        if original["sortBy"] in available:
            sortby.select_option(original["sortBy"])
            page.wait_for_timeout(500)

    if not matches():
        # 兜底路径：多绕一圈把 fallback 状态掰回来。
        groupby.select_option("requirement")
        page.wait_for_timeout(800)
        groupby.select_option(original["groupBy"])
        page.wait_for_timeout(800)
        sortby.select_option(original["sortBy"])
        page.wait_for_timeout(500)

    sortdir.select_option(original["sortDir"])
    page.wait_for_timeout(300)
    lang.select_option(original["lang"])
    page.wait_for_timeout(300)

    return matches()


def get_h2_columns_with_counts(page, known_names):
    """按 h2 标题读列名，并从其容器文本里取"N 张卡片"。用已知列名白名单过滤掉
    页面上跟看板无关的 h2（例如侧边栏"一起来共创"邀请卡片）。"""
    data = page.evaluate(
        """
        () => Array.from(document.querySelectorAll('h2')).map(h2 => {
          const container = h2.closest('div');
          return { heading: h2.textContent.trim(), containerText: container ? container.textContent.trim() : '' };
        })
        """
    )
    columns = []
    for entry in data:
        if entry["heading"] not in known_names:
            continue
        match = re.search(r"(\d+)\s*张卡片", entry["containerText"])
        columns.append({"name": entry["heading"], "cardCount": int(match.group(1)) if match else None})
    return columns


def get_milestone_columns(page, known_names):
    data = page.evaluate("() => Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim())")
    return [name for name in data if name in known_names]


def main() -> int:
    token = os.environ.get("TASKFOLD_E2E_TOKEN")
    if not token:
        print(json.dumps({"ok": False, "fatalError": "缺少环境变量 TASKFOLD_E2E_TOKEN"}))
        return 0

    out_dir = artifact_dir()
    result = {"ok": True, "sectionErrors": {}}

    console_errors = []
    network_errors = []
    websocket_urls = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 2200, "height": 1200})
            page = context.new_page()

            page.on(
                "console",
                lambda msg: console_errors.append({"type": msg.type, "text": msg.text})
                if msg.type == "error"
                else None,
            )
            page.on(
                "response",
                lambda res: network_errors.append({"status": res.status, "url": res.url})
                if res.status >= 400 and "18789" in res.url
                else None,
            )
            page.on("websocket", lambda ws: websocket_urls.append(ws.url))

            login(page, token)
            result["loginOk"] = True

            # --- 1. 项目列表：徽标 / 卡片数 / 归档过滤 -----------------------
            try:
                badge_before = get_badge_total(page)
                cards_before = get_visible_project_card_count(page)
                sidebar_before = get_sidebar_project_counts(page)

                archive_checkbox = page.locator('input[type="checkbox"]').first
                archive_checkbox.click()
                page.wait_for_timeout(1500)

                badge_after = get_badge_total(page)
                cards_after = get_visible_project_card_count(page)
                sidebar_after = get_sidebar_project_counts(page)

                archive_checkbox.click()
                page.wait_for_timeout(1000)
                archive_restored = not archive_checkbox.is_checked()

                page.screenshot(path=os.path.join(out_dir, "01-project-list.png"), full_page=True)

                result["projectBadgeTotal"] = {"before": badge_before, "after": badge_after}
                result["projectCardCountVisible"] = {"before": cards_before, "after": cards_after}
                result["sidebarProjectCounts"] = {"before": sidebar_before, "after": sidebar_after}
                result["archiveToggleRestored"] = archive_restored
            except Exception as exc:  # noqa: BLE001 - 巡检脚本，单节失败不影响其它节
                result["sectionErrors"]["projectList"] = repr(exc)

            # --- 2. 看板：状态列 / 里程碑列 --------------------------------
            try:
                page.get_by_role("heading", name="Taskfold").first.click()
                page.wait_for_timeout(2500)

                # 项目列表页没有"分列方式/排序方式"这些下拉，必须先进看板再读。
                original_prefs = read_view_prefs(page)

                known_status_names = [
                    "Triage", "待办池", "待办", "已计划", "就绪", "运行中", "查看", "已阻挡", "已完成",
                ]
                known_milestone_names = ["未归属", "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9"]

                milestone_columns = get_milestone_columns(page, known_milestone_names)
                page.screenshot(path=os.path.join(out_dir, "02-board-milestone-view.png"), full_page=True)

                groupby = page.locator("select").nth(1)
                groupby.select_option("status")
                page.wait_for_timeout(1500)
                status_columns = get_h2_columns_with_counts(page, known_status_names)
                page.screenshot(path=os.path.join(out_dir, "03-board-status-view.png"), full_page=True)

                restored = restore_view_prefs(page, original_prefs)

                result["milestoneColumns"] = milestone_columns
                result["statusColumns"] = status_columns
                result["viewPrefsRestored"] = {
                    "original": original_prefs,
                    "matches": restored,
                    "final": read_view_prefs(page),
                }
            except Exception as exc:  # noqa: BLE001
                result["sectionErrors"]["board"] = repr(exc)

            # --- 3. 语言切换 --------------------------------------------
            try:
                lang = page.locator("select").nth(0)
                options = lang.locator("option").all_text_contents()
                values = [lang.locator("option").nth(i).get_attribute("value") for i in range(len(options))]
                result["languageOptions"] = list(zip(values, options))

                lang.select_option("en")
                page.wait_for_timeout(1200)
                switched_value = lang.input_value()
                lang.select_option("zh-CN")
                page.wait_for_timeout(1200)
                restored_value = lang.input_value()

                result["languageSwitchRoundTrip"] = {
                    "switchedTo": switched_value,
                    "restoredTo": restored_value,
                }
            except Exception as exc:  # noqa: BLE001
                result["sectionErrors"]["language"] = repr(exc)

            # --- 4. ProCloud 卡片详情字段映射 ------------------------------
            try:
                # 上一节结束时停在 Taskfold 看板里，"ProCloud" 项目卡片在
                # 项目列表页才有；重新打开插件页回到项目列表（此时已登录，
                # 不会再显示令牌输入框，也就不会重新触发 login() 的填令牌
                # 逻辑）。登录后已有常开 WebSocket，这里不等 networkidle。
                page.goto(env_or("TASKFOLD_E2E_URL", DEFAULT_URL))
                page.wait_for_timeout(2000)

                page.get_by_role("heading", name="ProCloud").first.click()
                page.wait_for_timeout(2500)

                card = page.get_by_text(PROCLOUD_SAMPLE_CARD_TEXT, exact=False).first
                card.click()
                page.wait_for_timeout(2000)

                body = page.inner_text("body")
                idx = body.find("卡片详情")
                modal_text = body[idx : idx + 6000] if idx >= 0 else ""

                page.screenshot(path=os.path.join(out_dir, "04-procloud-card-detail.png"), full_page=True)

                found_markers = {marker: (marker in modal_text) for marker in CARD_DETAIL_MARKERS}
                broken_hits = [pattern for pattern in BROKEN_VALUE_PATTERNS if pattern in modal_text]

                assignee_value = None
                assignee_match = re.search(r"负责人\s*\n\s*([^\n]+)", modal_text)
                if assignee_match:
                    assignee_value = assignee_match.group(1).strip()

                # 关闭弹窗，不留下"卡片详情正打开"的视图状态。用 Escape
                # 而不是按文字找按钮：侧边栏"一起来共创"邀请卡片上也有一个
                # aria-label 含"关闭"的按钮，get_by_role(name="关闭") 默认的
                # 子串匹配会连带命中它，点到一个被弹窗盖住、点不到的元素上。
                page.keyboard.press("Escape")
                page.wait_for_timeout(500)

                result["cardDetail"] = {
                    "title": PROCLOUD_SAMPLE_CARD_TEXT,
                    "foundMarkers": found_markers,
                    "allMarkersFound": all(found_markers.values()),
                    "brokenValuePatternsFound": broken_hits,
                    "assigneeFieldValue": assignee_value,
                    "createdDateDisplayFound": False,
                    "createdDateNote": (
                        "详情弹窗未直接展示 created_date 字段；见脚本头部注释，"
                        "本轮不做基于排序的验证。"
                    ),
                }
            except Exception as exc:  # noqa: BLE001
                result["sectionErrors"]["cardDetail"] = repr(exc)

            # --- 5. 控制台 / 网络 / WebSocket -------------------------------
            # 前面几节操作期间持续挂着监听，这里再多等一小段时间，确保常开
            # WebSocket 与任何异步 404 都已经落地。
            page.wait_for_timeout(2000)
            result["consoleErrors"] = console_errors
            result["network4xx5xx"] = network_errors
            result["websocketUrls"] = list(dict.fromkeys(websocket_urls))

            browser.close()
    except Exception as exc:  # noqa: BLE001 - 兜底：无论如何都要输出一行 JSON
        result = {"ok": False, "fatalError": repr(exc)}

    print("TASKFOLD_E2E_RESULT " + json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
