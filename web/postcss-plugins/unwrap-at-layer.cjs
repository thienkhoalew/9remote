// iOS 15.0–15.3 drop every rule nested in @layer (supported starting in 15.4).
// Standalone module so postcss.config.mjs can reference it by path — Next's
// webpack build accepts PostCSS plugins as string module paths only. Export a
// creator function (Turbopack invokes the required module as a factory).
module.exports = function unwrapAtLayer() {
  return {
    postcssPlugin: "unwrap-at-layer",
    Once(root) {
      let pending = true;
      while (pending) {
        pending = false;
        root.walkAtRules("layer", (atRule) => {
          if (atRule.nodes) atRule.replaceWith(atRule.nodes);
          else atRule.remove();
          pending = true;
          return false;
        });
      }
    }
  };
};
