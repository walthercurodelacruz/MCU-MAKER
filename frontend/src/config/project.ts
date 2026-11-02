/**
 * Project identity constants shared across the UI.
 *
 * Single source of truth for the repository links: the header, the editor
 * menu and the "Star on GitHub" banner all read from here, so moving the
 * repository is a one-line change.
 */
export const PROJECT_NAME = 'MCU-Maker';

export const GITHUB_OWNER = 'walthercurodelacruz';

export const GITHUB_REPO = 'MCU-MAKER';

export const GITHUB_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

export const GITHUB_RELEASES_URL = `${GITHUB_URL}/releases`;

export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`;
