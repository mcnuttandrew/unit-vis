import { asRow, defaultSetting, getMarkValue, max, min } from "@unit-vis/core";
import type { Container, Spec, Layout, Mark } from "@unit-vis/core";
import { scaleOrdinal } from "d3-scale";
import { select } from "d3-selection";
import type { BaseType, Selection } from "d3-selection";
import * as schemes from "d3-scale-chromatic";

/**
 * One level of `<g>` elements, each bound to the container it draws. Successive
 * levels have different parent element types, so the loop below re-labels its
 * selection rather than threading the parent through the type.
 */
type LevelSelection = Selection<SVGGElement, Container, BaseType, unknown>;

type SchemeName = NonNullable<Mark["color"]["scheme"]>;

/**
 * Every level but the deepest holds further containers, and this only ever
 * walks the levels a layout produced.
 */
function childrenOf(container: Container): Container[] {
  return container.contents as Container[];
}

/** One shape per leaf container, so one per data row. */
function setMarksColor<GElement extends BaseType>(
  marks: Selection<GElement, Container, BaseType, unknown>,
  markPolicy: Mark,
): void {
  const palettes = schemes as unknown as Record<SchemeName, readonly string[]>;
  const color = scaleOrdinal(
    palettes[markPolicy.color.scheme || "schemeCategory10"],
  );
  if (markPolicy.color.type === "categorical") {
    // console.log('continue');
  } else {
    console.log("TODO");
  }
  marks.style("fill", (d) => {
    return color(String(asRow(d.contents[0])[markPolicy.color.key]));
  });
}

/** The largest circle the container has room for: half its shorter side. */
function inscribedRadius(container: Container): number {
  const { width, height } = container.visualspace;
  return width > height ? height / 2.0 : width / 2.0;
}

/**
 * The marks one mark is sized against, which is what `mark.size.isShared`
 * chooses: every mark in the chart, or the ones under the same parent
 * container.
 *
 * Grouping by parent rather than by anything the layout records keeps this
 * true of levels the grammar has no name for -- a sharing group is whatever
 * ended up in one box.
 *
 * Containers no row landed in are left out. They stand for nothing, so their
 * value would drag the group's largest around and their box would drag its
 * room; the vega backend never even builds a mark for one.
 */
function sizingGroups(
  leafContainers: Container[],
  markPolicy: Mark,
): Map<unknown, Container[]> {
  const groups = new Map<unknown, Container[]>();
  const shared = Boolean(markPolicy.size!.isShared);
  leafContainers.forEach((container) => {
    if (!container.contents.length) {
      return;
    }
    const key = shared ? null : container.parent;
    const group = groups.get(key);
    if (group) {
      group.push(container);
    } else {
      groups.set(key, [container]);
    }
  });
  return groups;
}

/**
 * One radius per leaf container, under the policy `mark.size` asked for.
 *
 * `max` is per container: as large as the box allows, or -- shared -- the
 * smallest such radius in the chart, so that no mark is bigger than the
 * tightest box could take. The other three size against a *group*, so they are
 * resolved a group at a time: the group's room is the smallest circle that
 * fits every container in it, and a mark takes the share of that room its
 * value has earned. Area carries the value, so the share is a square root.
 *
 * A container the group left out -- an empty one -- is missing from the result
 * and drawn at a radius of nothing, since it has no value to stand for.
 */
function calcRadii(
  leafContainers: Container[],
  markPolicy: Mark,
): Map<Container, number> {
  const radii = new Map<Container, number>();
  if (markPolicy.size!.type === "max") {
    const shared = markPolicy.size!.isShared
      ? min(leafContainers, inscribedRadius)
      : undefined;
    leafContainers.forEach((container) =>
      radii.set(container, shared ?? inscribedRadius(container)),
    );
    return radii;
  }

  sizingGroups(leafContainers, markPolicy).forEach((group) => {
    const room = min(group, inscribedRadius) ?? 0;
    const largest = max(group, (d) => getMarkValue(d, markPolicy)) ?? 0;
    group.forEach((container) => {
      const value = Math.max(0, getMarkValue(container, markPolicy));
      radii.set(container, largest > 0 ? room * Math.sqrt(value / largest) : 0);
    });
  });
  return radii;
}

export function drawUnit(
  container: Container,
  spec: Spec,
  /**
   * The layout list the scene was built with. The leaf containers come off the
   * selection this builds rather than from a second walk of the tree, so
   * nothing reads it -- it stays in the signature, which is exported.
   */
  _layoutList: { head: Layout },
  divId: string,
): void {
  const layouts = spec.layouts;
  const markPolicy = spec.mark!;

  const svg = select("#" + divId)
    .append("svg")
    .attr("width", spec.width!)
    .attr("height", spec.height!);

  const rootGroup: LevelSelection = svg
    .selectAll(".root")
    .data([container])
    .enter()
    .append("g")
    .attr("class", "root")
    .attr(
      "transform",
      ({ visualspace: { posX, posY } }) => `translate(${posX}, ${posY})`,
    );

  let currentGroup = rootGroup;
  layouts.forEach(function (layout) {
    // The box each container is drawn in, with the level's own styling filled
    // in from the library defaults wherever the layout left it out.
    const box = {
      opacity: layout.box?.opacity ?? defaultSetting.layout.box.opacity,
      fill: layout.box?.fill ?? defaultSetting.layout.box.fill,
      stroke: layout.box?.stroke ?? defaultSetting.layout.box.stroke,
      "stroke-width":
        layout.box?.["stroke-width"] ??
        defaultSetting.layout.box["stroke-width"],
    };

    const tempGroup: LevelSelection = currentGroup
      .selectAll("." + layout.name)
      .data(function (d) {
        return childrenOf(d);
      })
      .enter()
      .append("g")
      .attr("class", layout.name!)
      .attr("transform", ({ visualspace: { posX, posY } }) => {
        if (isNaN(posX) || isNaN(posY)) {
          console.log("NaN happened");
          console.log(spec);
        }
        return `translate(${posX}, ${posY})`;
      });

    tempGroup
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", (d) => d.visualspace.width)
      .attr("height", (d) => d.visualspace.height)
      .style("opacity", box.opacity)
      .style("fill", box.fill)
      .style("stroke", box.stroke)
      .style("stroke-width", box["stroke-width"]);

    currentGroup = tempGroup;
  });

  // The containers the marks are drawn in, which is what the size policies are
  // resolved over. They come off the selection because that is what was
  // actually drawn: a spec with no layouts at all draws one mark for the root
  // container, and there is no level of leaves to walk to.
  const leafContainers = currentGroup.data();

  if (markPolicy.shape === "rect") {
    const marks = currentGroup
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", (d) => d.visualspace.width)
      .attr("height", (d) => d.visualspace.height)
      .style("fill", "purple");
    setMarksColor(marks, markPolicy);
  } else {
    const radii = calcRadii(leafContainers, markPolicy);
    const marks = currentGroup
      .append("circle")
      .attr("cx", (d) => d.visualspace.width / 2)
      .attr("cy", (d) => d.visualspace.height / 2)
      .attr("r", (d) => radii.get(d) ?? 0)
      .style("fill", "purple");
    setMarksColor(marks, markPolicy);
  }
}
