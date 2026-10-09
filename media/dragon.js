// Shared pixel-art dragon renderer. Works in both Node (for the icon/preview
// scripts) and the browser (webview). Produces a grid of palette indices that
// the caller draws however it likes.
(function (root) {
  "use strict";

  // Palette: index -> hex (index 0 = transparent).
  var PAL = [
    null, // 0 transparent
    "#123625", // 1 outline
    "#4fbf72", // 2 body
    "#37985a", // 3 body shade
    "#86e6a0", // 4 body highlight
    "#f6e7bd", // 5 belly / snout
    "#e9d29a", // 6 belly shade
    "#f4cf5a", // 7 horn / spike
    "#d9a636", // 8 horn shade
    "#ffffff", // 9 eye white
    "#14202b", // 10 pupil
    "#3aa564", // 11 wing membrane
    "#59c985", // 12 wing light
    "#0f2a18", // 13 nostril / mouth
    "#ff9db0", // 14 blush
    "#c7f2d8", // 15 eye shine
  ];

  var W = 40,
    H = 38;

  function grid() {
    return new Uint8Array(W * H);
  }
  function px(g, x, y, c) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    g[y * W + x] = c;
  }
  function ell(g, cx, cy, rx, ry, c) {
    var x, y;
    for (y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var dx = (x - cx) / rx,
          dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) px(g, x, y, c);
      }
    }
  }

  function horn(g, x, dir) {
    ell(g, x, 6, 2.2, 2.4, 7);
    ell(g, x + dir, 3.6, 1.6, 2, 7);
    ell(g, x + dir * 2, 1.6, 1, 1.4, 7);
    ell(g, x + dir * 0.6, 5, 0.9, 1.3, 8); // inner shade
  }

  // Add a 1px dark outline around the whole silhouette.
  function outline(g, oc) {
    var src = g.slice();
    var nb = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (src[y * W + x] !== 0) continue;
        for (var i = 0; i < nb.length; i++) {
          var nx = x + nb[i][0],
            ny = y + nb[i][1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          var v = src[ny * W + nx];
          if (v !== 0 && v !== oc) {
            g[y * W + x] = oc;
            break;
          }
        }
      }
    }
  }

  /**
   * @param {Object} p
   * @param {number} p.wing   0..1 wing-flap phase (1 = wings up)
   * @param {boolean} p.blink eyes closed
   * @param {number} p.look   -1..1 pupil horizontal glance
   * @param {boolean} p.blush show cheek blush (happy)
   * @param {number} p.mouth  0..1 mouth open (roar)
   */
  function draw(p) {
    p = p || {};
    var wing = p.wing || 0;
    var g = grid();
    var cx = 20;
    var wy = 21 - wing * 7; // wings rise when flapping
    var wrx = 5.5 * (0.55 + 0.45 * (1 - wing));

    // ---- Wings (behind body, both sides) ----
    ell(g, 7, wy, wrx, 8.5, 11);
    ell(g, 7, wy + 1, wrx * 0.6, 5.5, 12);
    ell(g, 33, wy, wrx, 8.5, 11);
    ell(g, 33, wy + 1, wrx * 0.6, 5.5, 12);
    // wing finger ribs (little arcs)
    px(g, 4, wy + 4, 11);
    px(g, 36, wy + 4, 11);

    // ---- Feet ----
    ell(g, 14, 34, 4, 3, 3);
    ell(g, 26, 34, 4, 3, 3);
    ell(g, 14, 34, 3, 2, 2);
    ell(g, 26, 34, 3, 2, 2);
    // little claws
    px(g, 12, 36, 5);
    px(g, 14, 36, 5);
    px(g, 16, 36, 5);
    px(g, 24, 36, 5);
    px(g, 26, 36, 5);
    px(g, 28, 36, 5);

    // ---- Body ----
    ell(g, cx, 27, 11, 9, 3); // shade base
    ell(g, cx - 1, 26, 10, 8, 2); // body
    ell(g, cx - 3, 24, 6, 5.5, 4); // top-left highlight
    ell(g, cx, 28, 6.5, 6, 5); // belly
    ell(g, cx, 29.5, 5, 4, 6); // belly shade

    // ---- Head ----
    ell(g, cx, 13, 12, 11, 3); // shade
    ell(g, cx - 1, 12, 11.5, 10.5, 2); // head
    ell(g, cx - 3, 9, 6.5, 6, 4); // highlight

    // ---- Horns + center crest ----
    horn(g, 11, -1);
    horn(g, 29, 1);
    ell(g, cx, 3.5, 1.4, 2, 7);
    ell(g, cx, 1.8, 1, 1.4, 7);

    // ---- Snout ----
    ell(g, cx, 17.5, 5.5, 3.5, 5);
    ell(g, cx, 18.5, 4.5, 2.5, 6);
    px(g, cx - 2, 16, 13);
    px(g, cx + 2, 16, 13); // nostrils

    // ---- Mouth ----
    var mo = p.mouth || 0;
    if (mo > 0.2) {
      ell(g, cx, 20 + mo * 1.5, 2.5 + mo, 1 + mo * 2, 13);
      ell(g, cx, 21 + mo * 1.5, 1.5, mo * 1.2, 14);
    } else {
      px(g, cx - 1, 20, 13);
      px(g, cx, 20.4 | 0, 13);
      px(g, cx + 1, 20, 13);
    }

    // ---- Eyes ----
    var look = p.look || 0;
    if (p.blink) {
      for (var xx = -2; xx <= 2; xx++) {
        px(g, 15 + xx, 13, 1);
        px(g, 25 + xx, 13, 1);
      }
    } else {
      ell(g, 15, 12.5, 3, 4, 9);
      ell(g, 25, 12.5, 3, 4, 9);
      ell(g, 15 + look, 13.5, 1.8, 2.4, 10);
      ell(g, 25 + look, 13.5, 1.8, 2.4, 10);
      px(g, 14 + look, 12, 15);
      px(g, 24 + look, 12, 15); // shine
    }

    // ---- Blush ----
    if (p.blush) {
      ell(g, 10, 15.5, 2, 1.3, 14);
      ell(g, 30, 15.5, 2, 1.3, 14);
    }

    outline(g, 1);
    return { W: W, H: H, g: g };
  }

  var api = { draw: draw, PAL: PAL, W: W, H: H };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Dragon = api;
})(typeof window !== "undefined" ? window : this);
