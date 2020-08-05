# sync-html

An experiment to find out the smallest HTML template to DOM sync approach
(and also support rendering as string for server-side JS environment).

Mission is to get the bundle size as small as possible.

Current status:
template literal approach - ~1.5 KB gzipped
dumb DOM diff approach - 0.7 KB gzipped