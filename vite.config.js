import { resolve } from "node:path";
import { defineConfig } from "vite";

// MPA: the one-pager plus standalone case-study pages under /work/.
// Add one input per new case study.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        book: resolve(__dirname, "book/index.html"),
        lioncard: resolve(__dirname, "work/lioncard.html"),
        nationalentity: resolve(__dirname, "work/nationalentity.html"),
        lemonadmedia: resolve(__dirname, "work/lemonadmedia.html"),
        tramokyo: resolve(__dirname, "work/tramokyo.html"),
        visionquest: resolve(__dirname, "work/visionquest.html"),
        omegagti: resolve(__dirname, "work/omegagti.html"),
        mariposa: resolve(__dirname, "work/mariposa.html"),
      },
    },
  },
});
