# v1.5.7 — Tutorial movement tracking

- Count actual player displacement after movement is applied, including short WASD, arrow-key, and touch input frames.
- Prevent the first movement lesson from getting stuck near its 60-unit completion threshold because small per-frame movement was discarded.
- Add a keyboard-tap regression case to `node qa/camp-polish.cjs`.
