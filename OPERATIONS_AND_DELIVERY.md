# ScopeFlow 6 operational update

## What changed

- Versioned backup restore with Merge and Replace modes.
- Proposal archive/restore and draft Trash.
- Multiple invoices per approved agreement.
- Independent invoice archive, link control and payment reporting.
- Payment confirmation by the business owner starts or schedules the project according to the proposal rule.
- Delivery countdowns using calendar or business days.
- Owner/client live time remaining, due-soon states and project status.
- Pause, resume, extend, review, deliver and complete controls.
- Current-project dashboard ordered by deadline.
- Google Calendar and `.ics` expected-delivery milestone.
- Branded automatic email delivery through optional Resend configuration, with a prepared-email fallback.

## Urgency defaults

- On track: more than 72 hours remain.
- Due soon: 12–72 hours remain.
- Almost due: less than 12 hours remain.
- Overdue: deadline passed before delivery.

Both thresholds can be changed in Settings.

## Payment safety

A client clicking **I have sent payment** only creates a Payment reported state. The delivery timer starts only after the business owner verifies the payment and marks the invoice paid. The trigger can require full payment, a specified deposit or a manual start.

## Calendar behavior

The project page contains the live project window. Calendar buttons add the expected-delivery milestone as a one-hour event, with a one-day reminder, instead of blocking the user's entire calendar for the full project duration.
