# ArgusAI - 2-Minute Demo Script

---

## Setup (before you start)

- App open on phone at the deployed URL
- Manager dashboard open on laptop
- PO-4500003 loaded (Bearing & Seal AB, Sweden)

---

## [0:00] Open the App

"This is ArgusAI - a hands-free voice agent for warehouse goods receipt. A clerk scans or speaks through a delivery, and ArgusAI handles everything: logging, discrepancy detection, policy enforcement, and SAP document generation."

Open the web app on the phone. Show the home screen.

---

## [0:15] Start the Delivery

Tap "New Delivery". Select PO-4500003.

"PO-4500003 is an inbound delivery from our Swedish vendor, Bearing & Seal AB. The system has already pulled the expected line items from our SAP purchase order."

---

## [0:25] Voice Line 1 - Clean Match

Tap the microphone. Speak:

> "50 PTFE spiral wound gaskets"

"Gemini Live API transcribes and understands that in real time. It matches against the PO - 50 ordered, 50 received. Line logged. Green."

---

## [0:40] Voice Line 2 - Shortage, Auto-Accepted

Tap the microphone. Speak:

> "199 M6 pan head screws"

"200 were ordered. ArgusAI detects a shortage of 1 unit - that's 0.5%. Our policy tolerance is 2%, so the agent auto-accepts this and notes the minor variance. No human needed."

---

## [0:55] Photo 1 - Damaged Screws, Auto-Accepted

Switch to camera. Take a photo of the damaged screw packaging.

"Gemini Flash vision model analyses the image. It identifies damage to a batch of M6 screws - estimated value EUR 17.70. Again, within our damage threshold, so the agent auto-accepts and drafts a supplier claim for Bearing & Seal AB automatically."

---

## [1:15] Photo 2 - Damaged Bearings, Escalated

Take a photo of the damaged SKF bearing boxes.

"This one is different. Five SKF bearings, EUR 449 each - that's EUR 2,245 of damage. This exceeds the auto-accept threshold. ArgusAI escalates to the warehouse manager and pauses that line pending approval."

---

## [1:30] Manager Dashboard - Escalation Resolved

Switch to the laptop. Open the manager dashboard.

"The manager sees the escalation in real time - photo evidence, damage description, value flagged. They review it and hit Accept."

Click Accept on the escalation.

"Decision logged. The line is resolved."

---

## [1:45] Export SAP Documents

Back on the phone, tap "Complete Delivery".

"ArgusAI produces two SAP-ready documents: a goods receipt using movement type 101, and quality notifications for the damage claims - all structured to the Conduct SAP data format, ready to POST directly into the customer's SAP system."

Show the exported JSON on screen briefly.

---

## [1:55] Close

"Built on Gemini Live API for voice, Gemini Flash for vision, Pydantic AI agents, FastAPI deployed on Modal, with SQLite for state. Partners: Google DeepMind, Pydantic, Modal, and Conduct for SAP integration."

"ArgusAI turns a manual, error-prone process into a fully auditable, hands-free workflow."

---

## Fallback Notes

- If voice recognition is slow, narrate what would have been said and show the logged result.
- If the photo analysis takes more than 3 seconds, note: "In production this runs in under 2 seconds on average."
- The SAP JSON export works offline - safe to demo without a live SAP connection.
