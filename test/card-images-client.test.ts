// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createCardImageClient, isPendingImageRef } from "@taskfold/ui/lib/card-images.js";

const A = "0d2f6c1e-9a4b-4c3d-8e5f-1a2b3c4d5e6f";
const B = "1e3a7d2f-0b5c-4d4e-9f60-2b3c4d5e6f70";
const REF_A = `../attachments/${A}/img-aaa-111111.png`;

function file(name = "shot.png", type = "image/png", bytes = [1, 2, 3]) {
  return new File([new Uint8Array(bytes)], name, { type });
}

function fakeHost() {
  const calls: Array<{ method: string; params: any }> = [];
  const request = vi.fn(async (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params });
    if (method === "taskfold.cards.images.add") {
      return { ref: `../attachments/${params.id}/img-new${calls.length}-000000.png` };
    }
    if (method === "taskfold.cards.images.get") {
      return { mimeType: "image/png", contentBase64: "AQID" };
    }
    throw new Error(`unexpected ${method}`);
  });
  return { request, calls };
}

describe("上传与取图", () => {
  it("upload 把文件按 base64 交给宿主，返回宿主给的引用", async () => {
    const { request, calls } = fakeHost();
    const client = createCardImageClient(request);

    const ref = await client.upload(A, file());

    expect(ref).toBe(`../attachments/${A}/img-new1-000000.png`);
    expect(calls[0]).toEqual({
      method: "taskfold.cards.images.add",
      params: { id: A, fileName: "shot.png", mimeType: "image/png", contentBase64: "AQID" },
    });
  });

  it("resolve：按引用取图成 data URL，同一引用只请求一次", async () => {
    const { request, calls } = fakeHost();
    const client = createCardImageClient(request);

    expect(await client.resolve(REF_A)).toBe("data:image/png;base64,AQID");
    expect(await client.resolve(REF_A)).toBe("data:image/png;base64,AQID");

    expect(calls.filter((call) => call.method === "taskfold.cards.images.get")).toHaveLength(1);
    expect(calls[0]!.params).toEqual({ id: A, name: "img-aaa-111111.png" });
  });

  it("resolve：外链与不合规引用直接返回 undefined，不请求宿主", async () => {
    const { request } = fakeHost();
    const client = createCardImageClient(request);

    expect(await client.resolve("https://evil.example/x.png")).toBeUndefined();
    expect(await client.resolve("../attachments/x/../../config.yml")).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  it("resolve：失败不缓存，下次可重试", async () => {
    let fail = true;
    const request = vi.fn(async () => {
      if (fail) {
        throw new Error("host not connected");
      }
      return { mimeType: "image/png", contentBase64: "AQID" };
    });
    const client = createCardImageClient(request);

    await expect(client.resolve(REF_A)).rejects.toThrow("host not connected");
    fail = false;
    expect(await client.resolve(REF_A)).toBe("data:image/png;base64,AQID");
  });
});

describe("新建卡片：暂存与落盘", () => {
  it("stage 返回 pending 占位，预览是本地 data URL", async () => {
    const client = createCardImageClient(fakeHost().request);
    const ref = client.stage(file());

    expect(isPendingImageRef(ref)).toBe(true);
    expect(await client.resolvePending(ref)).toMatch(/^data:image\/png;base64,/);
    expect(await client.resolvePending("pending:999")).toBeUndefined();
  });

  it("flushPending：把 Markdown 里的暂存图片上传并换成真实引用，其他内容不动", async () => {
    const { request, calls } = fakeHost();
    const client = createCardImageClient(request);
    const one = client.stage(file("a.png"));
    const two = client.stage(file("b.png"));
    const markdown = `前\n\n![a](${one}) 与 ![b](${two})\n\n后`;

    const result = await client.flushPending(A, markdown);

    expect(calls.map((call) => call.method)).toEqual(["taskfold.cards.images.add", "taskfold.cards.images.add"]);
    expect(result).toBe(
      `前\n\n![a](../attachments/${A}/img-new1-000000.png) 与 ![b](../attachments/${A}/img-new2-000000.png)\n\n后`,
    );
    expect(client.hasPending(result)).toBe(false);
  });

  it("flushPending：同一张暂存图在文中出现两次只上传一次", async () => {
    const { request, calls } = fakeHost();
    const client = createCardImageClient(request);
    const ref = client.stage(file());

    const result = await client.flushPending(A, `![x](${ref}) ![x](${ref})`);

    expect(calls).toHaveLength(1);
    expect(result.match(/img-new1-000000\.png/g)).toHaveLength(2);
  });

  it("stripPending：先建卡、上传失败时去掉占位，不让 pending 引用落盘", () => {
    const client = createCardImageClient(fakeHost().request);
    const ref = client.stage(file());

    expect(client.stripPending(`文字 ![x](${ref}) 文字`)).toBe("文字  文字");
    expect(client.hasPending(`![x](${ref})`)).toBe(true);
  });
});

describe("复制卡片", () => {
  it("把属于原卡的图片拷到新卡并改写引用；别的卡的引用与外链不动", async () => {
    const { request, calls } = fakeHost();
    const client = createCardImageClient(request);
    const other = `../attachments/${B}/img-bbb-222222.png`;
    const markdown = `![1](${REF_A}) ![2](${other}) ![3](https://example.com/x.png)`;

    const result = await client.copyImages(A, B, markdown);

    expect(calls.map((call) => [call.method, call.params.id])).toEqual([
      ["taskfold.cards.images.get", A],
      ["taskfold.cards.images.add", B],
    ]);
    expect(result).toBe(
      `![1](../attachments/${B}/img-new2-000000.png) ![2](${other}) ![3](https://example.com/x.png)`,
    );
  });

  it("没有图片时不请求宿主，原样返回", async () => {
    const { request } = fakeHost();
    const client = createCardImageClient(request);

    expect(await client.copyImages(A, B, "纯文字")).toBe("纯文字");
    expect(request).not.toHaveBeenCalled();
  });
});
