# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Work lands on main

Commit and push straight to `main`. Don't open a pull request; if one is ever
asked for, open it ready for review, never as a draft.

`com.arise.deploy` fast-forwards `main` every two minutes and restarts only what
needs it, so `main` is the only branch the running app ever sees — work parked on
a branch is work that never ships. One maintainer, on a private tailnet: a pull
request here is a review round with nobody on the other end of it.
