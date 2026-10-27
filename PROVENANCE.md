# Technical provenance

The JavaScript, popup UI, and icons in this extension were newly written. No file or network service from the supplied CFC extension is bundled or called. The targeting values (`rpcids`, request path, frame tag, flag index) and response-rewriting approach were learned by inspecting that extension. This is not a clean-room design of the targeting logic.

The rule has not been verified against a live Google Flow account in this workspace. The age-status UI only classifies explicit, visible Flow page prompts; it cannot read a Google Account verification claim or implement age verification. Otherwise it reports unknown and links to Google's account page.
