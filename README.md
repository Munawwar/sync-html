# sync-html

An experiment to try out various tiny HTML template to DOM sync approach
(and also support rendering as string for server-side JS environment).

Current status:

* template literal approach - ~1.5 KB gzipped
* naive DOM patch approach - ~0.5 KB gzipped
* smarter DOM sync approach - ~0.8 KB gzipped

## How to check it

```sh
npm install -g http-server
npm start
```

Visit one of the following URLs:

* [localhost:8080/literal](http://localhost:8080/literal)
* [localhost:8080/dom-patch](http://localhost:8080/dom-patch)
* [localhost:8080/dom-sync](http://localhost:8080/dom-sync)
