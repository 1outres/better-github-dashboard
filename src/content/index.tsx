import { injectInitialStyle } from "./initial-style";
import { bootOverlay } from "./features/dashboard/boot-overlay";

// 最優先: GitHub のダッシュボード要素が visible になる前に隠す
injectInitialStyle();
// document_start で出しておく overlay。dashboard 以外のページでは内部で no-op になる。
bootOverlay.show();

import("./bootstrap");
