'use strict';
const Joi = require('joi');
const Boom = require('boom');
const Grid = require('gridfs-stream');
const mongodb = require('mongodb');
const util = require('./util');
const Convert = require('gm').subClass({imageMagick: true});

let routes = [];
let methods = {
    genericFileUpload: (request, reply, type, regex) => {

        let db = request.server.plugins['hapi-mongodb'].db;

        // check on correct file
        let file = request.payload.file[1] || request.payload.file;
        if (!file || !file.hapi) {
            return reply(Boom.badRequest('File required!'));
        }

        // test if an image format
        if (!regex.test(file.hapi.headers['content-type'])) {
            return reply(Boom.unsupportedMediaType('Only ' + type + ' format allowed'));
        }

        let bucket = new mongodb.GridFSBucket(db);
        let writestream = bucket.openUploadStream(methods.escapeFilename(file.hapi.filename));

        // stream image in db
        file.pipe(writestream);

        // succesful upload of image
        writestream.on('finish', file => {
            reply(file);
        });

        writestream.on('error', err => {
            reply(Boom.badRequest(err));
        });
    },
    escapeFilename: (filename) => {
        let value = filename.toLowerCase();
        value = value.replace(/ä/g, 'ae');
        value = value.replace(/ö/g, 'oe');
        value = value.replace(/ü/g, 'ue');
        value = value.replace(/ß/g, 'ss');
        value = value.replace(/&/g, 'und');
        value = value.replace(/'/g, '');
        value = value.replace(/\(/g, '_');
        value = value.replace(/\)/g, '_');
        value = value.replace(/ /g, '_');
        value = value.replace(/"/g, '');
        return value;
    }

};

routes.push({
    method: 'GET',
    path: '/file/{fileId}/{name}.{ext}',
    handler: (request, reply) => {
        let db = request.server.plugins['hapi-mongodb'].db;

        util.safeObjectId(request.params.fileId)
            .then(oId => {
                return db.collection('fs.files')
                    .find({_id: oId})
                    .limit(-1)
                    .next();
            })
            .then(result => {

                if (!result) {
                    return reply(Boom.notFound());
                }

                let bucket = new mongodb.GridFSBucket(db);
                let readstream = bucket.openDownloadStream(result._id);

                if (request.params.ext === 'mp4') {
                    return reply(readstream).type('video/mp4').bytes(result.length);
                }
                if (request.params.ext === '3gp') {
                    return reply(readstream).type('video/3gpp').bytes(result.length);
                }
                if (request.params.ext === 'mov') {
                    return reply(readstream).type('video/quicktime').bytes(result.length);
                }
                reply(readstream);
            })
            .catch(err => {
                if (err.message === 'Invalid id') {
                    return reply(Boom.badRequest(err.message));
                }
                reply(Boom.badImplementation(err));
            });


    },
    config: {
        auth: false,
        validate: {
            params: Joi.object().keys({
                fileId: Joi.string().required(),
                name: Joi.string().required(),
                ext: Joi.string().required()
                    .regex(/^jpg|png|jpeg|JPG|PNG|JPEG|mp4|3gp|mpeg|MP4|MPEG|mov|MOV$/)
            })
        },
        tags: ['api']
    }
});

routes.push({
    method: 'POST',
    path: '/stream/image',
    handler: (request, reply) => {

        let regex = /^image\/(?:jpg|png|jpeg)$/;
        methods.genericFileUpload(request, reply, 'image', regex)

    },
    config: {
        description: 'Add Image',
        notes: 'Uploads an image to a location',
        tags: ['api', 'location', 'new', 'image'],
        validate: {
            payload: {
                file: Joi.any().required().meta({swaggerType: 'file'})
            }
        },
        payload: {
            output: 'stream',
            parse: true,
            allow: 'multipart/form-data',
            maxBytes: 1048576 * 20 // 20MB
        },
        plugins: {
            'hapi-swagger': {
                payloadType: 'form'
            }
        }
    }
});


routes.push({
    method: 'POST',
    path: '/image/location',
    handler: (request, reply) => {

        let regex = /^image\/(?:jpg|png|jpeg)$/;

        let db = request.server.plugins['hapi-mongodb'].db;
        let bucket = new mongodb.GridFSBucket(db);

        // check on correct file
        let file = request.payload.file[1] || request.payload.file;
        if (!file || !file.hapi) {
            return reply(Boom.badRequest('File required!'));
        }

        // test if an image format
        if (!regex.test(file.hapi.headers['content-type'])) {
            return reply(Boom.unsupportedMediaType('Only image format allowed'));
        }

        let fileName = methods.escapeFilename(file.hapi.filename);

        // create Streams
        let xlargeWritestream = bucket.openUploadStream(fileName);
        let xLargeStream = Convert(file).autoOrient().resize('1400').interlace('Line').stream();


        // create other streams
        let uploadStreamArray = [];
        uploadStreamArray.push(bucket.openUploadStream(fileName));
        uploadStreamArray.push(bucket.openUploadStream(fileName));
        uploadStreamArray.push(bucket.openUploadStream(fileName));

        let streamArray = [];
        streamArray.push(Convert(file).autoOrient().resize('700').interlace('Line').stream());
        streamArray.push(Convert(file).autoOrient().resize('600').interlace('Line').stream());
        streamArray.push(Convert(file).autoOrient().resize('400').interlace('Line').stream());

        // stream biggest image in db
        xLargeStream.pipe(xlargeWritestream);

        // successful upload of biggest image
        xlargeWritestream.on('finish', file => {
            delete request.payload.file;
            reply({
                images: {
                    xlarge: xlargeWritestream.id,
                    large: uploadStreamArray[0].id,
                    normal: uploadStreamArray[1].id,
                    small: uploadStreamArray[2].id,
                    name: file.filename
                },
                location: request.payload
            });
        });

        xlargeWritestream.on('error', err => {
            reply(Boom.badRequest(err));
        });

        return;

        let i = 0;
        streamArray.forEach(stream => {

            stream.pipe(uploadStreamArray[i]);

            uploadStreamArray[i].on('error', err => {
                console.log('ERROR piping file into db: ', err);
            });

            i = i + 1;
        })


    },
    config: {
        description: 'Add Image',
        notes: 'Uploads an image for a location',
        tags: ['api', 'location', 'new', 'image'],
        validate: {
            payload: Joi.object().keys({
                title: Joi.string().min(3).max(50).required(),
                long: Joi.number().required(),
                lat: Joi.number().required(),
                categories: Joi.array().items(Joi.string().valid('nature', 'culture', 'secret', 'gastro', 'nightlife', 'holiday')).min(1).max(2).required(),
                file: Joi.any().required().meta({swaggerType: 'file'})
            })
        },
        payload: {
            output: 'stream',
            parse: true,
            allow: 'multipart/form-data',
            maxBytes: 1048576 * 6 // 6MB
        },
        plugins: {
            'hapi-swagger': {
                payloadType: 'form'
            }
        }
    }
});

routes.push({
    method: 'POST',
    path: '/stream/video',
    handler: (request, reply) => {

        let regex = /^video\/(?:mp4|3gpp|mpeg|mov|quicktime)$/;
        methods.genericFileUpload(request, reply, 'video', regex);

    },
    config: {
        description: 'Add video',
        notes: 'Uploads a video to db',
        tags: ['api', 'new', 'video'],
        validate: {
            payload: {
                file: Joi.any().required().meta({swaggerType: 'file'})
            }
        },
        payload: {
            output: 'stream',
            parse: true,
            allow: 'multipart/form-data',
            maxBytes: 1048576 * 6 // 6MB
        },
        plugins: {
            'hapi-swagger': {
                payloadType: 'form'
            }
        }
    }
});

routes.push({
    method: 'POST',
    path: '/stream/audio',
    handler: (request, reply) => {

        let regex = /^audio\/mp3$/;
        methods.genericFileUpload(request, reply, 'video', regex);

    },
    config: {
        description: 'Add audio',
        notes: 'Uploads an audio file to db',
        tags: ['api', 'new', 'audio'],
        validate: {
            payload: {
                file: Joi.any().required().meta({swaggerType: 'file'})
            }
        },
        payload: {
            output: 'stream',
            parse: true,
            allow: 'multipart/form-data',
            maxBytes: 1048576 * 6 // 6MB
        },
        plugins: {
            'hapi-swagger': {
                payloadType: 'form'
            }
        }
    }
});


routes.push({
    method: 'DELETE',
    path: '/file/{fileId}',
    handler: (request, reply) => {

        let id = request.params.fileId;

        let db = request.server.plugins['hapi-mongodb'].db;

        let gfs = new Grid(db, mongodb);

        gfs.remove({_id: id}, err => {

            if (err) {
                reply(Boom.badImplementation(err));
            }
            reply('OK');
        });

    },
    config: {
        description: 'Delete file',
        notes: 'Deletes a file with the given ID',
        tags: ['api', 'delete', 'file'],
        validate: {
            params: {
                fileId: Joi.string().required()
            }
        }
    }
});


routes.push({
    method: 'POST',
    path: '/image/user',
    handler: (request, reply) => {

        let regex = /^image\/(?:jpg|png|jpeg)$/;


        let db = request.server.plugins['hapi-mongodb'].db;
        let ObjectID = request.server.plugins['hapi-mongodb'].ObjectID;

        // generate IDs
        let thumbId = new ObjectID(); // 50x50
        let normalId = new ObjectID(); // 150x150

        // check on correct file
        let file = request.payload.file[1] || request.payload.file;
        if (!file || !file.hapi) {
            return reply(Boom.badRequest('File required!'));
        }

        // test if an image format
        if (!regex.test(file.hapi.headers['content-type'])) {
            return reply(Boom.unsupportedMediaType('Only image format allowed'));
        }

        let fileName = methods.escapeFilename(file.hapi.filename);
        let gfs = new Grid(db, mongodb);

        // create a writestream for the db
        let thumbWriteStream = gfs.createWriteStream({
            filename: fileName,
            _id: thumbId
        });

        // create Streams
        let thumbReadStream = Convert(file).autoOrient().resize('50').interlace('Line').stream();
        let normalReadStream = Convert(file).autoOrient().resize('150').interlace('Line').stream();

        // stream biggest image in db
        thumbReadStream.pipe(thumbWriteStream);

        // successful upload of biggest image
        thumbWriteStream.on('close', file => {

            reply({
                name: file.filename,
                images: {
                    small: thumbId,
                    normal: normalId
                }
            });
        });

        thumbReadStream.on('error', err => {
            reply(Boom.badRequest(err));
        });

        // create writeStream
        let writeStream = gfs.createWriteStream({
            filename: fileName,
            _id: normalId
        });

        normalReadStream.pipe(writeStream);

        writeStream.on('error', err => {
            console.log('ERROR piping file into db: ', err);
        });


    },
    config: {
        description: 'Add Image to a user',
        notes: 'Uploads an image to user',
        tags: ['api', 'user', 'new', 'image'],
        validate: {
            payload: {
                file: Joi.any().required().meta({swaggerType: 'file'})
            }
        },
        payload: {
            output: 'stream',
            parse: true,
            allow: 'multipart/form-data',
            maxBytes: 1048576 * 6 // 6MB
        },
        plugins: {
            'hapi-swagger': {
                payloadType: 'form'
            }
        }
    }
});

module.exports = routes;
