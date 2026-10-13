// @vitest-environment jsdom
// 只读渲染（卡片详情 / 评论）：放行卡片图片，其余一律丢弃；渲染后异步补图。
import { html, render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hydrateMarkdownImages,
  plainTextFromMarkdown,
  renderTaskfoldMarkdown,
} from "@taskfold/ui/lib/markdown.js";

const ID = "0d2f6c1e-9a4b-4c3d-8e5f-1a2b3c4d5e6f";
const REF = `../attachments/${ID}/img-lq3x9a-1f2e3d.png`;

const containers: HTMLElement[] = [];
afterEach(() => {
  for (const container of containers.splice(0)) {
    container.remove();
  }
});

function mount(markdown: string, resolve?: (ref: string) => Promise<string | undefined>) {
  const container = document.createElement("article");
  document.body.append(container);
  containers.push(container);
  render(
    html`<div class="taskfold-markdown" ${hydrateMarkdownImages(resolve)}>${renderTaskfoldMarkdown(markdown)}</div>`,
    container,
  );
  return container;
}

describe("renderTaskfoldMarkdown：图片净化", () => {
  it("卡片图片引用 → img[data-tf-ref]，不留 src（浏览器不会去请求）", () => {
    const container = mount(`![截图](${REF})`);
    const image = container.querySelector("img")!;
    expect(image.getAttribute("data-tf-ref")).toBe(REF);
    expect(image.hasAttribute("src")).toBe(false);
    expect(image.getAttribute("alt")).toBe("截图");
  });

  it.each([
    ["外链", "![x](https://evil.example/track.png)"],
    ["data URL", "![x](data:image/png;base64,AAAA)"],
    ["别的相对路径", "![x](./images/a.png)"],
    ["路径穿越", `![x](../attachments/${ID}/../../config.yml)`],
    ["svg", `![x](../attachments/${ID}/a.svg)`],
    ["脚本事件", '<img src="x" onerror="alert(1)">'],
    ["javascript:", '<img src="javascript:alert(1)">'],
  ])("%s：整张图丢掉", (_name, markdown) => {
    const container = mount(markdown);
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
  });

  it("只留 alt / title，其余属性（srcset、style、onload）全部清掉", () => {
    const container = mount(
      `<img src="${REF}" srcset="https://evil.example/a.png 2x" style="width:9999px" onload="alert(1)" title="说明" alt="a">`,
    );
    const image = container.querySelector("img")!;
    expect(image.getAttributeNames().toSorted()).toEqual(["alt", "data-tf-ref", "title"]);
  });

  it("用户自己写的 data-tf-ref 不会被带过来", () => {
    const container = mount(`<img src="https://evil.example/x.png" data-tf-ref="${REF}">`);
    expect(container.querySelector("img")).toBeNull();
  });

  it("其他危险标签仍被净化", () => {
    const container = mount("<script>alert(1)</script><iframe src='https://x'></iframe><button>b</button>文字");
    expect(container.querySelector("script, iframe, button")).toBeNull();
    expect(container.textContent).toContain("文字");
  });
});

describe("hydrateMarkdownImages", () => {
  it("渲染提交后给没有 src 的图补上 data URL", async () => {
    const resolve = vi.fn(async () => "data:image/png;base64,AAAA");
    const container = mount(`![a](${REF})`, resolve);

    await vi.waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA"));
    expect(resolve).toHaveBeenCalledWith(REF);
    expect(container.querySelector("img")?.dataset.state).toBe("ready");
  });

  it("取不到 / 抛错 / 没给 resolver：标为 error，不抛出", async () => {
    const missing = mount(`![a](${REF})`, async () => undefined);
    const failing = mount(`![a](${REF})`, async () => {
      throw new Error("boom");
    });
    const noResolver = mount(`![a](${REF})`);

    await vi.waitFor(() => {
      expect(missing.querySelector("img")?.dataset.state).toBe("error");
      expect(failing.querySelector("img")?.dataset.state).toBe("error");
      expect(noResolver.querySelector("img")?.dataset.state).toBe("error");
    });
  });
});

describe("plainTextFromMarkdown", () => {
  it("去掉图片引用只留 alt，其他文字原样", () => {
    expect(plainTextFromMarkdown(`前 ![截图](${REF}) 后`)).toBe("前 截图 后");
    expect(plainTextFromMarkdown(`![](${REF})`)).toBe("");
    expect(plainTextFromMarkdown("普通 [链接](https://x.com) 不动")).toBe("普通 [链接](https://x.com) 不动");
  });
});
