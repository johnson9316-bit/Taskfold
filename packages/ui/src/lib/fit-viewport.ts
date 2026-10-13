const fitted = new WeakSet<Element>();

/** 文档坐标里的顶边：把所有祖先的滚动量加回去，页面滚到哪里都得到同一个值。 */
function contentTop(element: Element): number {
  let top = element.getBoundingClientRect().top + window.scrollY;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    top += parent.scrollTop;
  }
  return top;
}

/**
 * Lit `ref` 回调：让元素撑满「它的顶边到视口底部」，高度写进 `--tf-board-height`。
 * 看板上方的内容（错误条、说明、控制条）多高都不用再手填偏移量。
 */
export function fitToViewport(element?: Element) {
  if (!element || fitted.has(element)) {
    return;
  }
  fitted.add(element);
  let attached = false;
  const apply = () => {
    if (!element.isConnected) {
      // Lit 先在文档片段里建好元素再插入，首次回调时还没挂到文档上；挂上之后才算「被移除」。
      if (attached) {
        observer.disconnect();
        window.removeEventListener("resize", apply);
      }
      return;
    }
    attached = true;
    const height = Math.max(320, Math.floor(window.innerHeight - contentTop(element) - 16));
    const value = `${height}px`;
    if ((element as HTMLElement).style.getPropertyValue("--tf-board-height") !== value) {
      (element as HTMLElement).style.setProperty("--tf-board-height", value);
    }
  };
  const observer = new ResizeObserver(apply);
  // 上方内容变高变矮会让整个看板区块的高度变化；元素自己的高度是我们设的，观察父级即可。
  if (element.parentElement) {
    observer.observe(element.parentElement);
  }
  window.addEventListener("resize", apply);
  requestAnimationFrame(apply);
}
