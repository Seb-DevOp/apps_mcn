# Digital Asset Links

`assetlinks.json` is how Android knows the app and this website are the same
product. Without it a Trusted Web Activity still runs, but it runs with a browser
address bar across the top — which is exactly the thing installing an app was
meant to remove.

Each entry pairs a package name with the SHA-256 fingerprint of the certificate
that signed the APK. Change the signing key and the fingerprint must change here
too, or the address bar comes back.

Two fingerprints will eventually be needed:

- the local test key, used for the sideloaded APK handed round for testing;
- the key Google Play re-signs with, once the app is published — Play App Signing
  replaces the upload key, and its fingerprint is shown in the Play Console under
  Setup → App signing.

Both can live in the array at the same time. Removing the test one after launch
is tidy but not required.
