# ms-fileserve

This repository is used to serve files out of a mongodb.

This is a seperate internal server instance. All file related requests to [cor](https://github.com/locator-kn/cor) are proxied to this server. The files are stored/retrieved in/from a mongo db.
