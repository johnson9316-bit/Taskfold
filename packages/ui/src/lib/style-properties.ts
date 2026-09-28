// 用 CSSOM 设置行内 CSS 属性的 Lit 元素指令，替代模板里对 `style` 属性的绑定。
//
// VS Code Webview 的严格 CSP（`style-src` 不含 'unsafe-inline'）会拦截对 `style` 属性的
// 写入：属性绑定走 setAttribute 被拦；lit 自带的 `styleMap` 首次渲染同样走
// setAttribute，也被拦。只有直接调用 `el.style.setProperty` 不受限（TASK-7 实测 0 违规）。
//
// 用法：`<div ${styleProperties({ "--taskfold-graph-zoom": zoom })}></div>`。
// 值为 undefined / null / "" 时移除该属性。
import { noChange } from "lit";
import {
  Directive,
  directive,
  PartType,
  type DirectiveParameters,
  type ElementPart,
  type PartInfo,
} from "lit/directive.js";

type StylePropertyValue = string | number | null | undefined;

class StylePropertiesDirective extends Directive {
  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error("styleProperties() must be used in element position.");
    }
  }

  render(_properties: Readonly<Record<string, StylePropertyValue>>) {
    return noChange;
  }

  override update(part: ElementPart, [properties]: DirectiveParameters<this>) {
    const { style } = part.element as HTMLElement;
    for (const [name, value] of Object.entries(properties)) {
      if (value === undefined || value === null || value === "") {
        style.removeProperty(name);
      } else {
        style.setProperty(name, String(value));
      }
    }
    return noChange;
  }
}

export const styleProperties = directive(StylePropertiesDirective);
