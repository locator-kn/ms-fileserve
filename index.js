'use strict';
const Glue = require('glue');

const path = require('path');
const pwd = path.join(__dirname, '..', '/.env');
require('dotenv').config({path: pwd});

const routes = require('./lib/module');
const util = require('ms-utilities');
const log = util.logger;

if (!(require('shelljs').which('convert'))) {
    throw new Error('ImageMagick not installed. Unable to run application. Please install it! Server shut down');
}


// declare  plugins
var manifest = {
    connections: [{
        //host: process.env['API_HOST'] || 'localhost',
        port: process.env['FILE_SERVE_PORT'] || 3453
    }],
    plugins: [{
        'hapi-mongodb': [{
            options: {
                'url': 'mongodb://' + process.env['DB_HOST'] + ':' + process.env['DB_PORT'] + '/' + process.env['DB_NAME'],
                'settings': {
                    'db': {
                        'native_parser': false
                    }
                }
            }
        }]
    }, {
        'inert': {}
    }, {
        'vision': {}
    }, {
        'hapi-swagger': {}
    }, {
        'hapi-auth-cookie': {}
    }, {
        'good': [{
            options: {
                requestPayload: true,
                reporters: [{
                    reporter: require('good-console'),
                    events: {log: '*', response: '*', request: '*'}
                }]
            }
        }]
    }]
};


// compose Server with plugins
Glue.compose(manifest, {relativeTo: __dirname}, (err, server) => {

    if (err) {
        throw err;
    }

    server.route(routes);

    server.on('request-error', (request, err) => {

        // log 500 code
        log.fatal('Server Error', {
            error: err,
            requestData: request.orig,
            path: request.path
        });

    });


    // log errors before response is sent back to user
    server.ext('onPreResponse', (request, reply) => {
        const response = request.response;
        if (!response.isBoom) {
            return reply.continue();
        }

        // log joi validation error
        if (response.data && response.data.isJoi) {
            log.fatal('Validation error', {
                response: response,
                requestData: request.orig,
                path: request.path
            });
        }

        reply.continue();
    });

    // start the server
    server.start((err) => {

        if (err) {
            throw err;
        }
        console.log('Server running at:', server.info.uri);
    });
});
