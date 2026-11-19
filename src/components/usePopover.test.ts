import { popoverPosition } from "./usePopover";

const viewport = { viewportWidth: 1280, viewportHeight: 720 };
const trigger = { top: 600, bottom: 640, left: 800, right: 1000 };

describe("popoverPosition", () => {
  it("opens under the trigger, lined up with its left edge", () => {
    expect(
      popoverPosition(
        { top: 100, bottom: 140, left: 40, right: 200 },
        { width: 256, align: "left", panelHeight: 200, ...viewport },
      ),
    ).toEqual({ top: 144, left: 40 });
  });

  it("lines a right-aligned panel up with the trigger and keeps it on screen", () => {
    // Right edge at 1270: the panel's right edge matches it (left 1014).
    expect(
      popoverPosition(
        { top: 100, bottom: 140, left: 1100, right: 1270 },
        { width: 256, align: "right", panelHeight: 200, ...viewport },
      ).left,
    ).toBe(1014);
    // Flush with the viewport's right edge: pulled in by the 8px margin.
    expect(
      popoverPosition(
        { top: 100, bottom: 140, left: 1200, right: 1280 },
        { width: 256, align: "right", panelHeight: 200, ...viewport },
      ).left,
    ).toBe(1016);
  });

  it("opens above the trigger when the panel would run off the bottom", () => {
    // 640 + 4 + 280 = 924, past a 720-tall viewport, and there's room above.
    expect(
      popoverPosition(trigger, { width: 256, align: "left", panelHeight: 280, ...viewport }),
    ).toEqual({ top: 316, left: 800 });
  });

  it("stays below while the panel's height isn't known yet", () => {
    expect(popoverPosition(trigger, { width: 256, align: "left", panelHeight: 0, ...viewport }).top).toBe(644);
  });
});
