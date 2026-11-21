TumorTrack — framework prototype (matches proposal v3)
1. Extract ZIP, open folder in VS Code.
2. Open index.html in a browser, or use Live Server extension (right click > Open with Live Server).
3. Load sample case on Overview (worked example of the proposal). Expected SPD 600, 360, 468;
   results Baseline, Stable (-40%), Progression * (+30% vs nadir).
4. Find tumor (model): the pretrained model (e.g. HD-GLIO) is not connected yet. "Run segmentation
   (simulated)" shows a synthetic slice with a simulated model outline and its d1 / d2. The user does
   not draw or click on the tumor; they accept the outline (measurements go to lesion 1) or flag it.
   The 3D upload and model selector are placeholders for when the model is connected.
5. Scans & review: up to 3 lesions per scan (d1 >= d2), or "No enhancing tumor left"; optional volume
   (information only). Accept or flag each scan; flagged scans are left out.
6. Rules (simplified RANO, proposal Table 4, in this order): Complete response* -> Non-measurable
   (no lesion with d1 and d2 >= 10 mm) -> Progression* (SPD >= +25% vs nadir, nadir includes baseline)
   -> Response* (SPD <= -50% vs baseline) -> Stable. * = confirm on next scan.
7. PDF export uses browser print dialog > Save as PDF. CSV is a direct download. No backend, internet
   or storage needed. Data disappear on refresh. Use fictional inputs only.
Technology: HTML5, CSS3, vanilla JavaScript. No dependencies.
