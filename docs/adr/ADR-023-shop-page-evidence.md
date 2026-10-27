# ADR-023: Owner-confirmed identities from a shop page

Status: Accepted by explicit operator instruction, 2026-10-27.

Scento lists Rabanne "Phantom Parfum", but its profile says "Phantom" (eau de toilette), so exact verification refuses it, which is correct. The operator looks up EANs on ICI PARIS XL and chose to add such fragrances from a shop page as evidence, confirmed by the owner (prompt `21_shop_page_evidence.md`).

## Decision

- **New identity state `owner_confirmed`** (migration `0010`, expand-only), shown as "Confirmed by you".
  - "Verified" and its lime signal stay reserved for an exact Scento match.
  - Compare, Discover indexing and the local barcode match accept both `verified` and `owner_confirmed`.
  - The Verified counter counts only `verified`.
- **Shop pages as evidence.** Only allow-listed shops: ICI PARIS XL `www.iciparisxl.nl` and `www.iciparisxl.be`, HTTPS, product path `/{brand}/{product}/{type}/p/{id}`, no credentials.
  - TinyFish fetches the page; the shop blocks scripted requests, and only the URL is sent.
  - The parser takes the brand, name and concentration from the URL path and the page title, and the "Topnoten", "Hartnoten", "Basisnoten" and "EAN code" lines from the product details.
  - Nothing is saved until the owner confirms the preview (and may correct the brand and name).
- **Storage.** The fragrance is created as `owner_confirmed`, or an existing draft of the same identity is upgraded; a `verified` fragrance is never changed. The notes become the owner's own claim (origin `user`), citing the page through a source record (provider `manual`, attribution "Confirmed by you from ICI PARIS XL"). The page's EAN belongs to the size shown on the page; the owner's own barcode is attached as with any quick find.
- More shops can be added to the allow-list with a parser and fixture each.
