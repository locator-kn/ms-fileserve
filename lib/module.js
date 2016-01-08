'use strict';

const db = require('./database');
var Grid = require('gridfs-stream');
var mongodb = require('mongodb');


const fns = {};


fns.getImage = (message, next) => {


    var gfs = new Grid(db, mongodb);

    var readstream = gfs.createReadStream({
        _id: request.params.companyId
    });

    return next(readstream);

  /*  return db.getAllUsers(message)
        .then(data => {
            next(null, {doc: 'asd', processId: process.pid});
        }).catch(err => {
            return next({message: 'cmd was not test', code: 4000});
        });*/

};

module.exports = fns;