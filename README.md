# Sovereign (AI-off copy)

This is a **copy** of Sovereign, made for the AI & Legal Reasoning Project 2. It is the same app with one difference: **every AI feature is switched off**.

- No call to any AI model or any service that needs a password or key. The page also carries a Content-Security-Policy (`connect-src 'self' blob: data:`) so the browser itself refuses requests to other addresses.
- Courses are built manually. Reading, assignments, rubrics, grades, the Dashboard, files and PDF exports all work on this device.
- Your data is saved only in your own browser (its own storage, separate from the original app).
- No passwords, keys or personal information are in this repository.

The original app is a separate project. This copy is rebuilt from it by a script, which also removes every AI control, call and setting from the code (not just from the screen) and then checks the result: the build fails if any network call or unexpected AI wording is left.

Work made by the AI in the full app can still arrive in an imported backup (for example a review of an assignment, or an AI-found reading). It is shown read-only and labelled as imported; this copy cannot make any.
