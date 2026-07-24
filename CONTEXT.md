# Bookly — Library Desk

Staff-facing back-office library desk tool (circulation, catalog, members, holds, fines). Not a patron portal.

## Language

**Hold**:
A member's place in the queue for a title; becomes tied to a specific copy only when marked ready.
_Avoid_: reservation

**Member**:
A person who borrows from the library. Identified at the desk by card barcode (`MBR-`).
_Avoid_: patron, borrower, customer, user (user = staff)

**Title**:
A bibliographic work (title/author/ISBN). Never lent directly — only its copies are.
_Avoid_: book (ambiguous between title and copy)

**Copy**:
A physical item of a title, identified by barcode (`BK-`). The unit of lending and of status (`available`, `on_loan`, …).
_Avoid_: item, book

**Loan**:
One copy checked out to one member. Overdue is a derived condition of a loan, never a stored status.

**Check-in**:
Returning a copy to the library. This IS the "return" action — one flow, not two.
_Avoid_: return (as a distinct action)

**Check-out**:
Issuing a copy to a member, subject to member status, fine block-threshold, and borrow cap.
_Avoid_: issue, lend

**Waive**:
Admin forgiveness of a fine's remaining unpaid balance. Prior payments stand — waiving never refunds.
_Avoid_: void (voiding applies to payments), cancel

**Void**:
Admin reversal of an erroneous payment record; the fine's balance is recomputed from remaining non-voided payments.
_Avoid_: refund, delete
