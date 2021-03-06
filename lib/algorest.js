var odata = require('./odata');
var helpers = require('./helpers');
var queryBuilder = require('./queryBuilder');
var queryExecutor = require('./queryExecutor');
var sync = require('synchronize');
var await = sync.await;
var defer = sync.defer;

var connectionString = '';
var app = null;
var defaultOptions = {};

var rest = function(tableName, options) {
    if(!options)
        options = defaultOptions;

    var resourceName = '/' + (options.resourceName || tableName);
    var elementResourceName = resourceName + '/:id';

    odata.applyOdataDefaults(options);

    var authorize = function(req, res, action, tableName, id) {
        if(options.authorize)
            if(!options.authorize(req, action, tableName, id)) {
                res.status(405).send({ error: 'forbidden' });
                throw new Error('User is forbidden to do ' + action + ' on table ' + tableName);
            }
    };

    var browseAction = function(req, res) {
        authorize(req, res, 'browse', tableName);

        var queryWithValues = queryBuilder.buildBrowseQuery(req, options, tableName);

        queryBuilder.printQueryWithValues(queryWithValues);

        queryExecutor.executeQueryWithValues(connectionString, queryWithValues, res, function(data) {
            res.send(helpers.renamePropertiesToCamelCase(data.rows));
        });
    };

    var readAction = function(req, res) {
        authorize(req, res, 'read', tableName, req.params.id);

        var queryWithValues = queryBuilder.buildReadQuery(req, options, tableName, req.params.id);

        queryBuilder.printQueryWithValues(queryWithValues);

        queryExecutor.executeQueryWithValues(connectionString, queryWithValues, res, function(data) {
            if(data.rows.length == 0) {
                res.status(404).send();
                return;
            }

            res.send(helpers.renamePropertiesToCamelCase(data.rows[0]));
        });
    };

    var editAction = function(req, res) {
        authorize(req, res, 'edit', tableName, req.params.id);

        var obj = req.body;

        if(options.validate)
            try {
                if(!await(options.validate(req, obj, 'edit', defer()))) {
                    res.status(400).send({ reason: 'Validation failed'});
                    return;
                }
            } catch(err) {
                res.status(400).send(err);
                return;
            }

        if(options.beforeEdit)
            try {
                await(options.beforeEdit(req, obj, defer()));
            } catch(err) {
                res.status(400).send(err);
                return;
            }

        var queryWithValues = queryBuilder.buildEditQuery(req, obj, tableName, req.params.id, options.where);

        queryBuilder.printQueryWithValues(queryWithValues);

        queryExecutor.executeQueryWithValues(connectionString, queryWithValues, res, function(data) {
            if(data.rowCount == 0)
                res.send(404, null);
            else
                res.send(204, null);
        });
    };

    var addAction = function(req, res) {
        authorize(req, res, 'add', tableName);

        var obj = req.body;

        if(options.validate)
            try {
                if(!await(options.validate(req, obj, 'edit', defer()))) {
                    res.status(400).send({ reason: 'Validation failed'});
                    return;
                }
            } catch(err) {
                res.status(400).send(err);
                return;
            }

        if(options.beforeAdd)
            try {
                await(options.beforeAdd(req, obj, defer()));
            } catch(err) {
                res.status(400).send(err);
                return;
            }

        var queryWithValues = queryBuilder.buildAddQuery(req, obj, tableName);

        queryBuilder.printQueryWithValues(queryWithValues);

        queryExecutor.executeQueryWithValues(connectionString, queryWithValues, res, function(data) {
            res.send(201, null);
        });
    };

    var deleteAction = function(req, res) {
        authorize(req, res, 'delete', tableName, req.params.id);

        var queryWithValues = queryBuilder.buildDeleteQuery(req, tableName, req.params.id, options.where);

        queryBuilder.printQueryWithValues(queryWithValues);

        queryExecutor.executeQueryWithValues(connectionString, queryWithValues, res, function(data) {
            if(data.rowCount == 0)
                res.send(404, null);
            else
                res.send(204, null);
        });
    };

    if(options.authenticate) {
        app.get(resourceName,           options.authenticate, function(req, res) { sync.fiber(function() { browseAction(req, res); }); });
        app.get(elementResourceName,    options.authenticate, function(req, res) { sync.fiber(function() { readAction(req, res); }); });
        app.put(elementResourceName,    options.authenticate, function(req, res) { sync.fiber(function() { editAction(req, res); }); });
        app.post(resourceName,          options.authenticate, function(req, res) { sync.fiber(function() { addAction(req, res); }); });
        app.delete(elementResourceName, options.authenticate, function(req, res) { sync.fiber(function() { deleteAction(req, res); }); });
    } else {
        app.get(resourceName,           function(req, res) { sync.fiber(function() { browseAction(req, res); }); });
        app.get(elementResourceName,    function(req, res) { sync.fiber(function() { readAction(req, res); }); });
        app.put(elementResourceName,    function(req, res) { sync.fiber(function() { editAction(req, res); }); });
        app.post(resourceName,          function(req, res) { sync.fiber(function() { addAction(req, res); }); });
        app.delete(elementResourceName, function(req, res) { sync.fiber(function() { deleteAction(req, res); }); });
    }
};

module.exports = exports = function(appInstance, connStr, options) {
    appInstance.rest = rest;
    app = appInstance;
    connectionString = connStr;

    if(options)
        defaultOptions = options;
};