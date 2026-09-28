import { Graph, NodeEvent, type IElementDragEvent, type IElementEvent } from "@antv/g6";
import { LitElement, html } from "lit";
import type { GraphModel, GraphMode, GraphNode } from "./graph-model.ts";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 58;

function palette(node: GraphNode): { fill: string; stroke: string } {
  if (node.kind === "project") return { fill: "#17324a", stroke: "#4d9ada" };
  if (node.kind === "group") return { fill: "#243126", stroke: "#67a568" };
  if (node.kind === "requirement") return { fill: "#302916", stroke: "#d0a342" };
  return { fill: "#222a35", stroke: "#607b9b" };
}

export class TaskfoldGraphCanvas extends LitElement {
  static properties = {
    model: { attribute: false },
    mode: { attribute: false },
    editable: { attribute: false },
  };

  declare model: GraphModel | null;
  declare mode: GraphMode;
  declare editable: boolean;
  private graph: Graph | null = null;
  private signature = "";
  private draggingId: string | null = null;

  constructor() {
    super();
    this.model = null;
    this.mode = "mindmap";
    this.editable = false;
  }

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  protected render() {
    return html`<div class="taskfold-project__graph-canvas" role="img" aria-label="Taskfold graph"></div>`;
  }

  protected updated(): void {
    const container = this.querySelector<HTMLElement>(".taskfold-project__graph-canvas");
    if (!container || !this.model) return;
    const signature = JSON.stringify([this.model, this.mode, this.editable]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.graph?.destroy();
    const childrenByNode = new Map<string, string[]>();
    for (const edge of this.model.edges) {
      if (edge.relation !== "contains") continue;
      const children = childrenByNode.get(edge.source) ?? [];
      children.push(edge.target);
      childrenByNode.set(edge.source, children);
    }
    const graph = new Graph({
      container,
      autoResize: true,
      padding: 28,
      zoomRange: [0.25, 2],
      animation: false,
      data: {
        nodes: this.model.nodes.map((node) => {
          const colors = palette(node);
          return {
            id: node.id,
            ...(this.mode === "mindmap" ? { children: childrenByNode.get(node.id) ?? [] } : {}),
            data: { kind: node.kind, cardId: node.cardId },
            style: {
              size: [NODE_WIDTH, NODE_HEIGHT],
              fill: colors.fill,
              stroke: colors.stroke,
              lineWidth: node.kind === "project" ? 2 : 1,
              radius: 7,
              labelText: `${node.title}${node.status ? `\n${node.statusLabel ?? node.status} · ${node.priority}` : ""}${node.childCount ? `  (${node.childCount})` : ""}`,
              labelFill: "#e6edf5",
              labelFontSize: 12,
              labelMaxWidth: 195,
              labelWordWrap: true,
              labelPlacement: "center",
              collapsed: this.mode === "mindmap" && this.model!.nodes.length > 14 && node.kind === "group",
            },
          };
        }),
        edges: this.model.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          data: { relation: edge.relation },
          style: {
            stroke: edge.relation === "blocks" ? "#d08b57" : edge.relation === "parent" ? "#e0b45b" : edge.relation === "relates_to" ? "#73869d" : "#5989b9",
            lineWidth: edge.relation === "contains" ? 1.5 : 2,
            lineDash: edge.relation === "relates_to" ? [5, 5] : undefined,
            endArrow: edge.relation !== "relates_to",
            opacity: edge.relation === "contains" ? 0.7 : 1,
          },
        })),
      },
      layout: this.mode === "mindmap"
        ? { type: "mindmap", direction: "LR", getWidth: () => NODE_WIDTH, getHeight: () => NODE_HEIGHT, getVGap: () => 18, getHGap: () => 42 }
        : this.model.edges.length
          ? { type: "dagre", rankdir: "TB", nodesep: 34, ranksep: 70, nodeSize: [NODE_WIDTH, NODE_HEIGHT] }
          : { type: "grid", cols: 2, nodeSize: [NODE_WIDTH, NODE_HEIGHT], preventOverlap: true, preventOverlapPadding: 28 },
      node: { type: "rect" },
      edge: { type: "polyline", style: { radius: 8 } },
      behaviors: [
        "drag-canvas",
        "zoom-canvas",
        ...(this.editable ? [{ type: "drag-element", dropEffect: "none", shadow: true, enable: (event: { target: { id: string } }) => Boolean(this.model?.nodes.find((node) => node.id === event.target.id)?.cardId) }] : []),
      ],
    });
    graph.on<IElementEvent>(NodeEvent.CLICK, (event) => {
      this.dispatchEvent(new CustomEvent("graph-select", { detail: { id: event.target.id }, bubbles: true }));
    });
    graph.on<IElementEvent>(NodeEvent.DBLCLICK, (event) => {
      if (this.mode === "mindmap" && this.model?.nodes.find((node) => node.id === event.target.id)?.kind === "group") {
        const id = event.target.id;
        const collapsed = Boolean(graph.getNodeData(id).style?.collapsed);
        void (collapsed ? graph.expandElement(id) : graph.collapseElement(id)).then(async () => {
          if (this.graph !== graph) return;
          await graph.focusElement(id);
          await graph.translateBy([-container.clientWidth * 0.24, 0]);
        }).catch((error: unknown) => {
          this.dispatchEvent(new CustomEvent("graph-error", { detail: { error }, bubbles: true }));
        });
        return;
      }
      this.dispatchEvent(new CustomEvent("graph-open", { detail: { id: event.target.id }, bubbles: true }));
    });
    graph.on<IElementDragEvent>(NodeEvent.DRAG_START, (event) => { this.draggingId = event.target.id; });
    graph.on<IElementDragEvent>(NodeEvent.DROP, (event) => {
      const targetId = event.target.id;
      if (!this.draggingId || this.draggingId === targetId) return;
      this.dispatchEvent(new CustomEvent("graph-drop", {
        detail: { source: this.draggingId, target: targetId }, bubbles: true,
      }));
      this.draggingId = null;
    });
    graph.on(NodeEvent.DRAG_END, () => {
      this.draggingId = null;
      void graph.layout();
    });
    this.graph = graph;
    void graph.render().then(async () => {
      if (this.graph !== graph) return;
      if (this.mode === "mindmap" && this.model && this.model.nodes.length > 14) {
        await graph.fitView();
      } else if (this.model && this.model.nodes.length > 10) {
        await graph.zoomTo(0.8);
        await graph.focusElement(this.mode === "mindmap" ? "project" : this.model.nodes[0]!.id);
        if (this.mode === "mindmap") await graph.translateBy([-container.clientWidth * 0.24, 0]);
        else if (!this.model.edges.length) await graph.translateBy([-container.clientWidth * 0.25, -container.clientHeight * 0.35]);
      } else {
        await graph.fitView();
      }
    }).catch((error: unknown) => {
      this.dispatchEvent(new CustomEvent("graph-error", { detail: { error }, bubbles: true }));
    });
  }

  disconnectedCallback(): void {
    this.graph?.destroy();
    this.graph = null;
    this.signature = "";
    super.disconnectedCallback();
  }

  fit(): void { void this.graph?.fitView(); }
  zoomBy(ratio: number): void { void this.graph?.zoomBy(ratio); }
  focusNode(id: string): void { void this.graph?.focusElement(id); }
}

if (!customElements.get("taskfold-graph-canvas")) {
  customElements.define("taskfold-graph-canvas", TaskfoldGraphCanvas);
}
