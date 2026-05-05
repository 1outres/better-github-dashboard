import { injectInitialStyle, showBootOverlay } from "./initial-style";

// 最優先: GitHub のダッシュボード要素が visible になる前に隠す
injectInitialStyle();
showBootOverlay();

import("./bootstrap");
