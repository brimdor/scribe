# Known Issues

## Firefox iOS Login Failure

**Issue:** Users cannot log in to Scribe when using Firefox on iOS (iPad/iPhone).

**Error:** "Invalid GitHub credentials"

**Root Cause:** Firefox on iOS has strict Intelligent Tracking Prevention (ITP) and cross-site cookie blocking that prevents the session cookie from being set.

**Workaround:** Use a different browser on iOS:
- Microsoft Edge (works ✅)
- Safari (likely works)
- Chrome (likely works)

**Status:** Won't fix - this is a browser limitation beyond Scribe's control. Firefox iOS treats cross-site cookies much more strictly than other browsers.
