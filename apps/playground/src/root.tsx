import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Chart from "./chart";
import DefaultChooser from "./default-chooser";
import { defaultSpecName, options } from "./specs";
import Editor from "./Editor";
import type { Spec } from "@unit-vis/core";
import { classnames } from "./utils";
import { useHashRoute } from "./use-hash-route";
import { Github, Warning } from "./icons";

const defaultSpec = options.find(({ name }) => name === defaultSpecName)!;

/** Neither pane is useful below this, so the drag stops there. */
const MIN_PANE = 320;

export default function Root() {
  // The hash owns which spec is loaded, so every route into one -- the chooser,
  // prev/next, the back button, a pasted link -- goes through the same place.
  const [specName, setSpecName] = useHashRoute();
  const [showAbout, setAbout] = useState(false);

  const selectedSpec =
    options.find(({ name }) => name === specName) ?? defaultSpec;

  // An absent or unrecognized hash gets rewritten to the spec actually on
  // screen, so the URL always names the view. Replacing rather than pushing
  // keeps that correction out of the back button's way.
  useEffect(() => {
    setSpecName(selectedSpec.name, true);
  }, [selectedSpec, setSpecName]);

  // Edits are tagged with the spec they were made against, so selecting a
  // different spec shows that spec rather than the previous one's leftovers --
  // without an effect racing the render to clear them.
  const [edit, setEdit] = useState<{ name: string; text: string } | null>(null);
  const code = edit?.name === selectedSpec.name ? edit.text : selectedSpec.text;
  const changeSpec = useCallback(
    (text: string) => setEdit({ name: selectedSpec.name, text }),
    [selectedSpec],
  );

  // The parse result and the error message come from the same attempt, so the
  // error bar can never disagree with what the chart is showing.
  const { parsedCode, parseError } = useMemo(() => {
    try {
      return { parsedCode: JSON.parse(code) as Spec, parseError: null };
    } catch (e) {
      return { parsedCode: null, parseError: (e as Error).message };
    }
  }, [code]);

  const [editorWidth, setEditorWidth] = useState<number | null>(null);
  const dragging = useRef(false);

  // The listeners live on the window rather than the handle: a fast drag
  // outruns a 1px target, and letting go outside it has to end the drag too.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) {
        return;
      }
      e.preventDefault();
      setEditorWidth(
        Math.min(Math.max(e.clientX, MIN_PANE), window.innerWidth - MIN_PANE),
      );
    };
    const onUp = () => {
      dragging.current = false;
      document.body.classList.remove("is-resizing");
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const handle = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(handle);
  }, [copied]);

  return (
    <div className="appbody">
      <div className="header">
        <img className="header__logo" src="/favicon.svg" alt="" />
        <h1>Unit Vis</h1>
        <span className="header__rule" />
        <span className="header__tag">a grammar for unit visualizations</span>
        <span className="header__spacer" />
        <div className="header__links">
          <a
            className="header__link"
            href="https://github.com/mcnuttandrew/unit-vis"
            target="_blank"
            rel="noreferrer"
          >
            <Github />
            GitHub
          </a>
        </div>
      </div>
      <div className="flex main-content">
        <div
          className="flex-down left-column"
          style={
            editorWidth === null
              ? undefined
              : { width: editorWidth, flex: "0 0 auto" }
          }
        >
          <DefaultChooser
            specName={selectedSpec?.name ?? defaultSpecName}
            setSpecName={setSpecName}
          ></DefaultChooser>
          <Editor onChange={changeSpec} code={code} />
          {parseError && (
            <div className="error-bar">
              <Warning />
              <span>{parseError}</span>
            </div>
          )}
        </div>
        <div
          className="splitter"
          onMouseDown={() => {
            dragging.current = true;
            document.body.classList.add("is-resizing");
          }}
          role="separator"
          aria-orientation="vertical"
        />
        <div className="right-column">
          <div className="chart-panel-controls">
            <div
              className={classnames({
                "chart-option": true,
                "selected-chart-option": !showAbout,
              })}
              onClick={() => setAbout(false)}
            >
              Chart
            </div>
            <div
              className={classnames({
                "chart-option": true,
                "selected-chart-option": showAbout,
              })}
              onClick={() => setAbout(true)}
            >
              About
            </div>
          </div>
          <div className="panel-scroll">
            {showAbout ? (
              <div className="about-container">
                <h1>Unit Vis</h1>
                <p className="about-lede">
                  A declarative grammar for unit visualizations — charts where
                  every row of the data gets its own mark — rendered here by two
                  independent backends at once.
                </p>

                <p>
                  This is the display page for the unit-vis library, a fork of{" "}
                  <a href="https://github.com/intuinno/unit">
                    Park et al's unit grammar
                  </a>{" "}
                  for specifying unit based charts through a declarative
                  grammar. We make the core library available as a reusable
                  utility with a single entry point.{" "}
                  <a href="https://www.microsoft.com/en-us/research/uploads/prod/2019/01/atom.pdf">
                    You can find the paper here
                  </a>
                  .
                </p>

                <h2>Getting it</h2>
                <p>
                  Install with <code>npm install unit-vis</code>. The code is
                  available on{" "}
                  <a href="https://github.com/mcnuttandrew/unit-vis">github</a>{" "}
                  if you are curious about how it's implemented or if you wish
                  to contribute to the library.
                </p>

                <h2>The two backends</h2>
                <p>
                  Edit the spec on the left and both panes redraw.{" "}
                  <code>unit-vis</code> lays the chart out in JS and draws it
                  with d3; <code>unit-vis-vega</code> compiles the same spec
                  into a vega dataflow that lays itself out and draws itself.
                  They should agree — when they don't, that's a bug worth
                  reporting.
                </p>
              </div>
            ) : (
              <Chart spec={parsedCode ?? undefined} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
