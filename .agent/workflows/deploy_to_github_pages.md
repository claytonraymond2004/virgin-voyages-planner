---
description: How to deploy the Virgin Voyages Planner to GitHub Pages using GitHub Actions
---

This workflow describes how to deploy the static version of the application to GitHub Pages using the configured GitHub Actions workflow.

1.  **Push your code to GitHub**
    Ensure your latest changes, including the `.github/workflows/deploy.yml` file, are pushed to the `main` branch of your repository.

2.  **Configure GitHub Pages Source**
    -   Go to your repository on GitHub: `https://github.com/claytonraymond2004/virgin-voyages-planner`
    -   Click on the **Settings** tab.
    -   On the left sidebar, under the "Code and automation" section, click on **Pages**.
    -   Under **Build and deployment** > **Source**, select **GitHub Actions**.
    -   (The rest of the configuration is handled automatically by the `deploy.yml` file).

3.  **Trigger the Deployment**
    -   If you just pushed the workflow file, the action might have already started.
    -   You can check the progress in the **Actions** tab of your repository.
    -   Look for the workflow named "Deploy to GitHub Pages".

4.  **Verify the Deployment**
    -   Once the action completes (green checkmark), your site will be live at `https://claytonraymond2004.github.io/virgin-voyages-planner/`.
    -   **Note:** The deployment automatically excludes development files like `*.bak`, `*.md`, `*.py`, `Dockerfile`, and `.gitignore` as requested.

5.  **Troubleshooting**
    -   If the Action fails, click on the failed run in the **Actions** tab to view the logs.
    -   Ensure that "Workflow permissions" (under Settings > Actions > General) are set to "Read and write permissions" if you encounter permission errors, though the workflow file explicitly requests the necessary permissions.
