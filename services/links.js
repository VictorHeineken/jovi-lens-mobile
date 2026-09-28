import * as Linking from 'expo-linking';

// Opens a link that came from stored data (note sources, AI video cards, a
// restored backup). Only http(s) is handed to the OS: anything else — an
// intent://, a custom app scheme, javascript: — is refused, since that data is
// not necessarily ours. Returns whether the link was opened.
export async function openExternalUrl(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) return false;
  try {
    await Linking.openURL(url.trim());
    return true;
  } catch {
    return false;
  }
}
