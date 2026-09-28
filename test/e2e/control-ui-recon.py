#!/usr/bin/env python3
"""Taskfold Control UI 文件后端只读巡检。

巡检前后不改任何项目数据；只在当前浏览器会话切换归档过滤与语言。
令牌由调用方通过环境变量传入，不打印或写盘。
"""

import json
import os
import re
import sys
import tempfile

from playwright.sync_api import sync_playwright

DEFAULT_URL = "http://127.0.0.1:18789/plugin?plugin=taskfold&id=taskfold"
LOGIN_INPUT_SELECTOR = '#login-gate-credential'
CONNECT_BUTTON_SELECTOR = 'button.login-gate__connect'

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

    if login_input.count() and login_input.first.is_visible():
        raise RuntimeError("登录后页面仍显示令牌输入提示，登录可能失败")
    # 新版宿主首次登录默认英语；本脚本的界面基线使用简体中文。语言只在浏览器本地保存。
    language = page.locator("select").first
    language.select_option("zh-CN")
    page.wait_for_timeout(500)


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

                known_milestone_names = ["未归属", "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9"]

                milestone_columns = get_milestone_columns(page, known_milestone_names)
                page.screenshot(path=os.path.join(out_dir, "02-board-milestone-view.png"), full_page=True)

                status_values = page.locator('.taskfold-project__card-footer select[aria-label="状态"]').evaluate_all(
                    "elements => elements.map(element => element.value)"
                )
                status_counts = {status: status_values.count(status) for status in (
                    "triage", "backlog", "todo", "scheduled", "ready", "running", "review", "blocked", "done"
                )}

                result["milestoneColumns"] = milestone_columns
                result["statusCounts"] = status_counts
                result["viewPrefsRestored"] = {
                    "original": original_prefs,
                    "matches": read_view_prefs(page) == original_prefs,
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
