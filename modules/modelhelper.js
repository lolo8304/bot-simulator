var querystring = require('querystring');
var url = require('url');

module.exports = ModelHelper;

function ModelHelper (server, name, multipleName) {
  return new Model(server, name, multipleName);
};

function Model(server, name, multipleName) {
    registerModelAPIs(server, name, multipleName, '_id', false, true); 
      
  }


function RestApiError(code, message) {
    this.name = "RestApiError";
    this.message = "["+code+"] "+(message || "");
}
RestApiError.prototype = Error.prototype;

function getHttpErrorCode(e) {
    var hasError = /^\[.*\].*$/.test(e.message);
    if (hasError) {
        var myRegexp = /^\[(.*)\].*$/;
        var match = myRegexp.exec(e.message);
        return parseInt(match[1], 10);
    } else {
        return 500;
    }
}

function isError(e, docs, defaultString) {
    if (e && e.name == "RestApiError") {
        return true;
    } else if (e) {
        return true;
    } else if (!docs && defaultString != undefined) {
        return true;
    }
    return false;
}
function handleError(res, e, docs, defaultString) {
    if (e && e.name == "RestApiError") {
        console.log("handle error: e="+e+", docs="+docs+", str="+defaultString);
        res.status(getHttpErrorCode(e))
        res.send(e.message);
        //res.render('500', {error: err, stack: err.stack});
        return true;
    } else if (e) {
        console.log("handle error: e="+e+", docs="+docs+", str="+defaultString);
        res.status(500)
        res.send(e.message);
        return true;
    } else if (!docs && defaultString != undefined) {
        console.log("handle error: e="+e+", docs="+docs+", str="+defaultString);
        res.status(404)
        res.send(defaultString);
        return true;
    }
    return false;
}

function isEmpty(obj) {
    return obj == undefined || obj.length == 0;
}
function isInvalidWildcard(obj) {
    return /^.*[\.\*].*$/.test(obj);
}


function isNumeric(obj) {
    // parseFloat NaNs numeric-cast false positives (null|true|false|"")
    // ...but misinterprets leading-number strings, particularly hex literals ("0x...")
    // subtraction forces infinities to NaN
    // adding 1 corrects loss of precision from parseFloat (#15100)
    return !Array.isArray(obj) && (obj - parseFloat(obj) + 1) >= 0;
}
function isInteger(obj) {
    return isNumeric(obj) && obj.indexOf('.') < 0;
}

function thisURL(req, dictionary = {}) {
    var path = req.server.url + req.url;
    var u = url.parse(path, true);
    u.href = u.href.replace(u.host, req.headers["host"]);
    u.host = req.headers["host"];
    u.hostname = req.headers["host"].split(":")[0];

    for (item in dictionary) {
        u.query[item] = dictionary[item];
    }
    var query = "?"+querystring.stringify(u.query);
    u.server = u.href.substr(0, u.href.length - u.path.length);
    u.href = u.server + u.pathname + query;
    return u;
}


function fullUrl(req, dictionary = {}) {
    return thisURL(req, dictionary).href;
}


function linkURL(req, skip, limit, max, overwrite) {
    //console.log(skip +" / "+limit + "/ "+max);
    if (!overwrite) {
        if (skip < 0) {
            return null;
        }
        if (skip + limit > max) {
            return null;
        }
        if (skip >= max) {
            return null;
        }
    }
    return fullUrl(req, { "skip" : skip, "limit" : limit});
}

function buildResponseLimited(req, res, skip, limit, e, docs, totalCount) {
    if (handleError(res, e, docs, undefined)) {
        return;
    }
    var lastSkip = (Math.floor(totalCount / limit)) * limit;
    if (lastSkip == totalCount) { lastSkip = Math.max(0, lastSkip - limit); }
    var prevSkip = skip - limit;
    var nextSkip = skip + limit;
    res.json(200, {
        "links" : {
            "cur" : linkURL(req, skip, limit, totalCount, true),
            "first" : linkURL(req, 0, limit, totalCount, true),
            "prev" : linkURL(req, prevSkip, limit, totalCount, false),
            "next" : linkURL(req, nextSkip, limit, totalCount, false),
            "last" : linkURL(req, lastSkip, limit, totalCount, true),
            "count" : docs.length,
            "totalCount" : totalCount
        },
        "data" : docs
    })
}

function buildOptions(req, idName, sortColumn, fieldsFilter) {
    var limit = parseInt(req.param('limit'));
    var skip = parseInt(req.param('skip')); 

    if (!limit) { 
        limit = 10; 
    }
    if (limit > 25 || limit < -25 ) {
        throw new RestApiError("400", 'limit <'+limit+'> is too high. Use skip (max +/-25) & limit to get data');
    }
    if (!skip) { 
        skip = 0; 
    }
    if (isEmpty(sortColumn)) {
        var options = {
            "limit": limit,
            "skip": skip
        }
    } else {
        var options = {
            "limit": limit,
            "skip": skip,
            "sort": sortColumn
        }
    }
    if (fieldsFilter != undefined) {
        options["fields"] = fieldsFilter;
    }
    return options;
}
function findLimited(req, res, collection, idName, query, sortColumn, fieldFilter) {
    var options = buildOptions(req, idName, sortColumn, fieldFilter);
    var limit = options.limit;
    var skip = options.skip; 
    collection.count(query, function (e1, totalCount) {
        if (handleError(res, e1, totalCount, undefined)) {
            return;
        }
        collection.find(query, options, function(e, docs){
            buildResponseLimited(req, res, skip, limit, e, docs, totalCount);
        });
    });

}


function verifyRESTSecurity(req) {
    var keyFound = (req.header("app_key") === process.env.APP_KEY)
    var secretFound = (req.header("app_secret") === process.env.APP_SECRET);
    return keyFound && secretFound;
}
/************* start model **************************/


function registerModelAPIs(server, type, typeMultiple, idName, isIdInteger, hasLimitCollection, zipSearch, customerRelation) {
    if (isIdInteger === undefined) isIdInteger = false; // default string
    if (zipSearch === undefined) zipSearch = { "hasZipSearch" : false, "fieldName" : "" }; // default string
    if (customerRelation === undefined) customerRelation = { "hasRelation" : false, "sort" : "id" }; // default string

    /*
    * GET models.
    */
    server.get('/model/'+typeMultiple, function(req, res, next) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        var db = req.db;
        var collection = db.get(typeMultiple);
        if (hasLimitCollection) {
            try {
                var sortColumn = {};
                sortColumn[idName] = 1;
                findLimited(req, res, collection, idName, {}, sortColumn);
            } catch (e) {
                if (handleError(res, e, null, "no results found")) {
                    return;
                }
            }
        } else {
            var options = {
                "sort": idName
            }
            collection.find({ }, options, function(e,docs){
                res.json(200, docs)
            });
        }
    });


    if (isIdInteger) {
        /*
        * GET model by id (integer)
        */
        server.get('/model/'+typeMultiple+'/:id', function(req, res, next) {
            if (!verifyRESTSecurity(req)) {
                return handleError(res,
                    new RestApiError("403", 'illegal KEY and SECRET'));
            }
                var db = req.db;
            var collection = db.get(typeMultiple);
            if (!isInteger(req.params.id)) {
                return handleError(res,
                    new RestApiError("400", 'id '+req.params.id+'is not integer'));
            } else {
                var idToSearch = parseInt(req.params.id);
                collection.findOne({ id : idToSearch }, function(e,docs){
                    if (handleError(res, e, docs, 'No '+type+' found with id '+idToSearch)) {
                        return;
                    }
                    res.json(200, docs)
                });
            } 
        });
        
    } else {

        /*
        * GET model by id (string)
        */
        server.get('/model/'+typeMultiple+'/:id', function(req, res, next) {
            if (!verifyRESTSecurity(req)) {
                return handleError(res,
                    new RestApiError("403", 'illegal KEY and SECRET'));
            }
                var db = req.db;
            var collection = db.get(typeMultiple);
            var idToSearch = req.params.id;
            if (idName == "_id") {
                collection.findOne({ _id : idToSearch }, function(e,docs){
                    if (handleError(res, e, docs, 'No '+type+' found with _id '+idToSearch)) {
                        return;
                    }
                    res.json(200, docs);
                });
            } else {
                collection.findOne({ id : idToSearch }, function(e,docs){
                    if (handleError(res, e, docs, 'No '+type+' found with id '+idToSearch)) {
                        return;
                    }
                    res.json(200, docs);
                });
            }
        });
    }

    server.get('/model/'+typeMultiple+'/search/byQuery/:query/:sort/:filter', function(req, res, next) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        var db = req.db;
        var collection = db.get(typeMultiple);
        var queryStringToSearch = req.params.query;
        var sortString = req.params.sort;
        var filterString = req.params.filter;
        if (isEmpty(queryStringToSearch)) {
                return handleError(res,
                    new RestApiError("400", 'parameter query is empty'));
        } else if (isEmpty(sortString)) {
                return handleError(res,
                    new RestApiError("400", 'parameter sort is empty'));
        } else {
            try {
                var queryToSearch = JSON.parse(queryStringToSearch);
                try {
                    var sortToSearch = JSON.parse(sortString);
                    var filterToSearch = undefined;
                    if (filterString != undefined && filterString != "" && filterString != "{}") {
                        try {
                            filterToSearch = JSON.parse(filterString);
                        } catch (e) {
                            return handleError(res,
                                new RestApiError("400", 'filter is not a valid JSON string <br>&nbsp;'+filterString));
                        }
                    }
                    findLimited(req, res, collection, idName, queryToSearch, sortToSearch, filterToSearch);
                } catch (e) {
                    return handleError(res,
                        new RestApiError("400", 'sort is not a valid JSON string <br>&nbsp;'+sortString));
                }
            } catch (e) {
                return handleError(res,
                    new RestApiError("400", 'query is not a valid JSON string <br>&nbsp;'+queryStringToSearch));
            }
        }
    });

    if (zipSearch.hasZipSearch) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        server.get('/model/'+typeMultiple+'/search/byZip/:zip', function(req, res, next) {
            var db = req.db;
            var collection = db.get(typeMultiple);
            var options = {
                "sort": idName
            }
            if (!isInteger(req.params.zip)) {
                return handleError(res,
                    new RestApiError("400", 'parameter zip '+req.params.zip+' is not integer'));
            } else {
                var zipToSearch = parseInt(req.params.zip);
                var sortedColumn = {};
                sortedColumn[idName] = 1;
                var zipColumn = {};
                zipColumn[zipSearch.fieldName] = zipToSearch;
                findLimited(req, res, collection, idName, zipColumn, sortedColumn);
            } 
        });
    }

    server.get('/model/'+typeMultiple+'/search/byWord/:text', function(req, res, next) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        var db = req.db;
        var collection = db.get(typeMultiple);
        var options = {
            "sort": idName
        }
        var textToSearch = req.params.text;
        if (isEmpty(textToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter text is empty'));
        } else if (isInvalidWildcard(textToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter text '+req.params.name+' is not a valid wildcard. Neither can contain a * nor a .'));
        } else {
            var sortColumn = {};
            sortColumn[idName] = 1;
            findLimited(req, res, collection, idName, 
                { "$text": { 
                    "$search": textToSearch,
                    "$diacriticSensitive": true
                } }, sortColumn );
        }
    });

    server.get('/model/'+typeMultiple+'/search/near/:longitude,:latitude,:meter', function(req, res, next) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        var db = req.db;
        var collection = db.get(typeMultiple);
        if (!isNumeric(req.params.longitude)) {
            return handleError(res,
                new RestApiError("400", 'longitude '+req.params.longitude+'is not numeric'));
        }
        if (!isNumeric(req.params.latitude)) {
            return handleError(res,
                new RestApiError("400", 'latitude '+req.params.latitude+'is not numeric'));
        }
        if (!isInteger(req.params.meter)) {
            return handleError(res,
                new RestApiError("400", 'meter '+req.params.meter+'is not integer'));
        }
        var longitudeSearch = parseFloat(req.params.longitude);
        var latitudeSearch = parseFloat(req.params.latitude);
        var meterSearch = parseInt(req.params.meter);

        var query = {
            "location" : {
                "$nearSphere" :
                    {
                        "$geometry" : { 
                            "type" : "Point", 
                            "coordinates" : [ longitudeSearch, latitudeSearch ] },
                        "$maxDistance" : meterSearch
                    }
        }
        };

        findLimited(req, res, collection, idName, query, {} );
    });

    server.get('/model/'+typeMultiple+'/:typ/:alter/:farbe', function(req, res, next) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        var db = req.db;
        var collection = db.get(typeMultiple);
        var options = {
            "sort": "id"
        }
        var typToSearch = req.params.typ;
        var alterToSearch = req.params.alter;
        var farbeToSearch = req.params.farbe;
        if (isEmpty(typToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter typ is empty'));
        }
        if (isEmpty(alterToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter alter is empty'));
        }
        if (isEmpty(farbeToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter farbe is empty'));
        }
        var filter = {};
        if (typToSearch != "*") {
            filter["typ"] = typToSearch;
        }
        if (alterToSearch != "*") {
            filter["alter"] = alterToSearch;
        }
        if (farbeToSearch != "*") {
            filter["farbe"] = farbeToSearch;
        }
        findLimited(req, res, collection, "id", filter, {"id" : 1});
    });

    server.get('/model/'+typeMultiple+'/:typ/:alter/:farbe/:kategorie', function(req, res, next) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        var db = req.db;
        var collection = db.get(typeMultiple);
        var options = {
            "sort": "id"
        }
        var typToSearch = req.params.typ;
        var alterToSearch = req.params.alter;
        var farbeToSearch = req.params.farbe;
        var kategorieToSearch = req.params.kategorie;
        if (isEmpty(typToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter typ is empty'));
        }
        if (isEmpty(alterToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter alter is empty'));
        }
        if (isEmpty(farbeToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter farbe is empty'));
        }
        if (isEmpty(kategorieToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter kategorie is empty'));
        }
        var filter = {};
        if (typToSearch != "*") {
            filter["typ"] = typToSearch;
        }
        if (alterToSearch != "*") {
            filter["alter"] = alterToSearch;
        }
        if (farbeToSearch != "*") {
            filter["farbe"] = farbeToSearch;
        }
        if (kategorieToSearch != "*") {
            filter["kategorie"] = kategorieToSearch;
        }
        findLimited(req, res, collection, "id", filter, {"id" : 1});
    });
}

