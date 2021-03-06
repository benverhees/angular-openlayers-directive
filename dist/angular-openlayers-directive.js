(function() {

"use strict";

angular.module('openlayers-directive', [])
       .directive('openlayers', ["$log", "$q", "olHelpers", "olMapDefaults", "olData", function($log, $q, olHelpers, olMapDefaults, olData) {
    var _olMap;
    return {
        restrict: 'EA',
        replace: true,
        scope: {
            center: '=center',
            defaults: '=defaults',
            layers: '=layers',
            markers: '=markers',
            view: '=view',
            controls: '=controls',
            events: '=events'
        },
        transclude: true,
        template: '<div class="angular-openlayers-map"><div ng-transclude></div></div>',
        controller: ["$scope", function($scope) {
            _olMap = $q.defer();
            this.getMap = function() {
                return _olMap.promise;
            };

            this.getOpenlayersScope = function() {
                return $scope;
            };
        }],

        link: function(scope, element, attrs) {
            var isDefined = olHelpers.isDefined;
            var createLayer = olHelpers.createLayer;
            var createProjection = olHelpers.createProjection;
            var setEvents = olHelpers.setEvents;
            var defaults = olMapDefaults.setDefaults(scope.defaults, attrs.id);

            // Set width and height if they are defined
            if (isDefined(attrs.width)) {
                if (isNaN(attrs.width)) {
                    element.css('width', attrs.width);
                } else {
                    element.css('width', attrs.width + 'px');
                }
            }

            if (isDefined(attrs.height)) {
                if (isNaN(attrs.height)) {
                    element.css('height', attrs.height);
                } else {
                    element.css('height', attrs.height + 'px');
                }
            }

            var controls = ol.control.defaults(defaults.controls);
            var interactions = ol.interaction.defaults(defaults.interactions);
            var projection = createProjection(defaults.view.projection);

            // Create the Openlayers Map Object with the options
            var map = new ol.Map({
                target: element[0],
                controls: controls,
                interactions: interactions,
                renderer: defaults.renderer,
                view: new ol.View({
                    projection: projection,
                    maxZoom: defaults.view.maxZoom,
                    minZoom: defaults.view.minZoom,
                })
            });

            // If no layer is defined, set the default tileLayer
            if (!isDefined(attrs.layers)) {
                var layer = createLayer(defaults.layers.main);
                map.addLayer(layer);
            }

            // If no events ared defined, set the default events
            if (!isDefined(attrs.events)) {
                setEvents(defaults.events, map, scope);
            }

            if (!isDefined(attrs.center)) {
                var view = map.getView();
                view.setCenter([defaults.center.lon, defaults.center.lat]);
                view.setZoom(defaults.center.zoom);
            }

            // Resolve the map object to the promises
            olData.setMap(map, attrs.id);
            _olMap.resolve(map);
        }
    };
}]);

angular.module('openlayers-directive').directive('center', ["$log", "$location", "olMapDefaults", "olHelpers", function($log, $location, olMapDefaults, olHelpers) {
    return {
        restrict: 'A',
        scope: false,
        replace: false,
        require: 'openlayers',

        link: function(scope, element, attrs, controller) {
            var safeApply         = olHelpers.safeApply;
            var isValidCenter     = olHelpers.isValidCenter;
            var isDefined         = olHelpers.isDefined;
            var isArray           = olHelpers.isArray;
            var isNumber          = olHelpers.isNumber;
            var isSameCenterOnMap = olHelpers.isSameCenterOnMap;
            var olScope           = controller.getOpenlayersScope();

            controller.getMap().then(function(map) {
                var defaults = olMapDefaults.getDefaults(attrs.id);
                var center = olScope.center;

                if (!center) {
                    center = {};
                }

                var view = map.getView();
                var setCenter = function(view, projection, newCenter) {
                    if (newCenter.projection === projection) {
                        view.setCenter([newCenter.lon, newCenter.lat]);
                    } else {
                        var coord = [newCenter.lon, newCenter.lat];
                        view.setCenter(ol.proj.transform(coord, projection, newCenter.projection));
                    }
                };

                if (!center.projection) {
                    if (defaults.view.projection !== 'pixel') {
                        center.projection = defaults.center.projection;
                    } else {
                        center.projection = defaults.view.projection;
                    }
                }

                if (attrs.center.search('-') !== -1) {
                    $log.error('[AngularJS - Openlayers] The "center" variable can\'t use ' +
                               'a "-" on his key name: "' + attrs.center + '".');
                    setCenter(view, defaults.view.projection, defaults.center);
                    return;
                }

                if (!isValidCenter(center)) {
                    $log.warn('[AngularJS - Openlayers] invalid \'center\'');
                    center = angular.copy(defaults.center);
                }

                if (!isNumber(center.zoom)) {
                    center.zoom = 1;
                }

                setCenter(view, defaults.view.projection, center);
                view.setZoom(center.zoom);

                var centerUrlHash;
                if (center.centerUrlHash === true) {
                    var extractCenterFromUrl = function() {
                        var search = $location.search();
                        var centerParam;
                        if (isDefined(search.c)) {
                            var cParam = search.c.split(':');
                            if (cParam.length === 3) {
                                centerParam = {
                                    lat: parseFloat(cParam[0]),
                                    lon: parseFloat(cParam[1]),
                                    zoom: parseInt(cParam[2], 10)
                                };
                            }
                        }
                        return centerParam;
                    };
                    centerUrlHash = extractCenterFromUrl();

                    olScope.$on('$locationChangeSuccess', function() {
                        centerUrlHash = extractCenterFromUrl();
                    });
                }

                var geolocation;
                olScope.$watch('center', function(center) {

                    if (!center) {
                        return;
                    }

                    if (isDefined(centerUrlHash)) {
                        var urlCenter = extractCenterFromUrl();
                        if  (!isSameCenterOnMap(urlCenter, map)) {
                            center.lat = centerUrlHash.lat;
                            center.lon = centerUrlHash.lon;
                            center.zoom = centerUrlHash.zoom;
                        }
                        centerUrlHash = undefined;
                    }


                    if (!center.projection) {
                        center.projection = defaults.center.projection;
                    }

                    if (center.autodiscover) {
                        if (!geolocation) {
                            geolocation = new ol.Geolocation({
                                projection: ol.proj.get(defaults.view.projection)
                            });

                            geolocation.on('change', function() {
                                if (center.autodiscover) {
                                    var location = geolocation.getPosition();
                                    safeApply(olScope, function(scope) {
                                        scope.center.lat = location[1];
                                        scope.center.lon = location[0];
                                        scope.center.zoom = 12;
                                        scope.center.autodiscover = false;
                                        geolocation.setTracking(false);
                                    });
                                }
                            });
                        }
                        geolocation.setTracking(true);
                        return;
                    }

                    if (!isValidCenter(center)) {
                        $log.warn('[AngularJS - Openlayers] invalid \'center\'');
                        center = defaults.center;
                    }

                    var viewCenter = view.getCenter();
                    if (viewCenter) {
                        if (defaults.view.projection === 'pixel') {
                            view.setCenter(center.coord);
                            return;
                        }
                        var actualCenter = ol.proj.transform(viewCenter, center.projection, defaults.view.projection);
                        if (!(actualCenter[1] === center.lat && actualCenter[0] === center.lon)) {
                            setCenter(view, defaults.view.projection, center);
                        }
                    }

                    if (view.getZoom() !== center.zoom) {
                        view.setZoom(center.zoom);
                    }
                }, true);

                view.on('change:resolution', function() {
                    safeApply(olScope, function(scope) {
                        scope.center.zoom = view.getZoom();

                        // Notify the controller about a change in the center position
                        olHelpers.notifyCenterUrlHashChanged(olScope, scope.center, $location.search());

                        // Calculate the bounds if needed
                        if (isArray(scope.center.bounds)) {
                            var extent = view.calculateExtent(map.getSize());
                            var centerProjection = scope.center.projection;
                            var viewProjection = defaults.view.projection;
                            scope.center.bounds = ol.proj.transform(extent, centerProjection, viewProjection);
                        }
                    });
                });

                view.on('change:center', function() {
                    safeApply(olScope, function(scope) {
                        var center = map.getView().getCenter();
                        if (defaults.view.projection === 'pixel') {
                            scope.center.coord = center;
                            return;
                        }

                        if (scope.center) {
                            var proj = ol.proj.transform(center, scope.center.projection, defaults.view.projection);
                            scope.center.lat = proj[1];
                            scope.center.lon = proj[0];

                            // Notify the controller about a change in the center position
                            olHelpers.notifyCenterUrlHashChanged(olScope, scope.center, $location.search());

                            // Calculate the bounds if needed
                            if (isArray(scope.center.bounds)) {
                                var extent = view.calculateExtent(map.getSize());
                                var centerProjection = scope.center.projection;
                                var viewProjection = defaults.view.projection;
                                scope.center.bounds = ol.proj.transform(extent, centerProjection, viewProjection);
                            }
                        }
                    });
                });

            });
        }
    };
}]);

angular.module('openlayers-directive').directive('layers', ["$log", "$q", "olData", "olMapDefaults", "olHelpers", function($log, $q, olData, olMapDefaults, olHelpers) {
    var _olLayers;

    return {
        restrict: 'A',
        scope: false,
        replace: false,
        require: 'openlayers',
        controller: function() {
            _olLayers = $q.defer();
            this.getLayers = function() {
                return _olLayers.promise;
            };
        },
        link: function(scope, element, attrs, controller) {
            var isDefined   = olHelpers.isDefined;
            var equals      = olHelpers.equals;
            var olLayers    = {};
            var olScope     = controller.getOpenlayersScope();
            var createLayer = olHelpers.createLayer;
            var createStyle = olHelpers.createStyle;

            controller.getMap().then(function(map) {
                var defaults = olMapDefaults.getDefaults(attrs.id);
                var projection = map.getView().getProjection();

                olScope.$watch('layers', function(layers, oldLayers) {
                    if (!isDefined(layers)) {
                        $log.warn('[AngularJS - OpenLayers] At least one layer has to be defined.');
                        layers = angular.copy(defaults.layers);
                    }

                    var layer = layers[Object.keys(layers)[0]];
                    var name;
                    if (!isDefined(layer) || !isDefined(layer.source) || !isDefined(layer.source.type)) {
                        $log.warn('[AngularJS - OpenLayers] At least one layer has to be defined.');
                        layers = angular.copy(defaults.layers);
                    }

                    // Delete non existent layers from the map
                    for (name in olLayers) {
                        layer = olLayers[name];
                        if (!layers.hasOwnProperty(name)) {
                            // Remove from the map if it's on it
                            var activeLayers = map.getLayers();
                            for (var i in activeLayers) {
                                if (activeLayers[i] === layer) {
                                    map.removeLayer(layers);
                                }
                            }
                            delete olLayers[name];
                        }
                    }

                    // add new layers
                    for (name in layers) {
                        layer = layers[name];
                        var olLayer;
                        var style;
                        if (!olLayers.hasOwnProperty(name)) {
                            olLayer = createLayer(layers[name], projection);
                            if (isDefined(olLayer)) {
                                olLayers[name] = olLayer;
                                map.addLayer(olLayer);

                                if (layer.opacity) {
                                    olLayer.setOpacity(layer.opacity);
                                }

                                if (layer.style) {
                                    if (!angular.isFunction(layer.style)) {
                                        style = createStyle(layer.style);
                                    } else {
                                        style = layer.style;
                                    }
                                    olLayer.setStyle(style);
                                }
                            }
                        } else {
                            layer = layers[name];
                            var oldLayer = oldLayers[name];
                            olLayer = olLayers[name];
                            if (isDefined(oldLayer) && !equals(layer, oldLayer)) {
                                if (!equals(layer.source, oldLayer.source)) {
                                    map.removeLayer(olLayer);
                                    delete olLayers[name];
                                    olLayer = createLayer(layer, projection);
                                    if (isDefined(olLayer)) {
                                        olLayers[name] = olLayer;
                                        map.addLayer(olLayer);
                                    }
                                }

                                if (layer.opacity && layer.opacity !== oldLayer.opacity) {
                                    olLayer.setOpacity(layer.opacity);
                                }

                                if (layer.style && !equals(layer.style, oldLayer.style)) {
                                    if (!angular.isFunction(layer.style)) {
                                        style = createStyle(layer.style);
                                    } else {
                                        style = layer.style;
                                    }
                                    olLayer.setStyle(style);
                                }
                            }
                        }
                    }
                }, true);

                // We can resolve the layer promises
                _olLayers.resolve(olLayers);
                olData.setLayers(olLayers, attrs.id);
            });
        }
    };
}]);

angular.module('openlayers-directive').directive('events', ["$log", "$q", "olData", "olMapDefaults", "olHelpers", function($log, $q, olData, olMapDefaults, olHelpers) {
    return {
        restrict: 'A',
        scope: false,
        replace: false,
        require: ['openlayers', 'layers'],
        link: function(scope, element, attrs, controller) {
            var setEvents     = olHelpers.setEvents;
            var isDefined     = olHelpers.isDefined;
            var mapController = controller[0];
            var olScope       = mapController.getOpenlayersScope();

            mapController.getMap().then(function(map) {

                var getLayers;
                if (isDefined(controller[1])) {
                    getLayers = controller[1].getLayers;
                } else {
                    getLayers = function() {
                        var deferred = $q.defer();
                        deferred.resolve();
                        return deferred.promise;
                    };
                }

                getLayers().then(function(layers) {
                    olScope.$watch('events', function(events) {
                        setEvents(events, map, olScope, layers);
                    });
                });
            });
        }
    };
}]);

angular.module('openlayers-directive')
       .directive('view', ["$log", "$q", "olData", "olMapDefaults", "olHelpers", function($log, $q, olData, olMapDefaults, olHelpers) {
    return {
        restrict: 'A',
        scope: false,
        replace: false,
        require: 'openlayers',
        link: function(scope, element, attrs, controller) {
            var olScope   = controller.getOpenlayersScope();
            var isNumber = olHelpers.isNumber;
            var safeApply         = olHelpers.safeApply;

            controller.getMap().then(function(map) {
                var defaults = olMapDefaults.getDefaults(attrs.id);
                var view = olScope.view;
                var mapView = map.getView();

                if (!view.projection) {
                    view.projection = defaults.view.projection;
                }

                if (!view.maxZoom) {
                    view.maxZoom = defaults.view.maxZoom;
                }

                if (!view.minZoom) {
                    view.minZoom = defaults.view.minZoom;
                }

                if (!view.rotation) {
                    view.rotation = defaults.view.rotation;
                }

                olScope.$watch('view', function(view) {
                    if (isNumber(view.rotation)) {
                        mapView.setRotation(view.rotation);
                    }
                }, true);

                mapView.on('change:rotation', function() {
                    safeApply(olScope, function(scope) {
                        scope.view.rotation = map.getView().getRotation();
                    });
                });

            });
        }
    };
}]);

angular.module('openlayers-directive')
       .directive('controls', ["$log", "$q", "olData", "olMapDefaults", "olHelpers", function($log, $q, olData, olMapDefaults, olHelpers) {

    return {
        restrict: 'A',
        scope: false,
        replace: false,
        require: 'openlayers',
        link: function(scope, element, attrs, controller) {
            var olScope   = controller.getOpenlayersScope();

            controller.getMap().then(function(map) {
                var defaults = olMapDefaults.getDefaults(attrs.id);
                var detectControls = olHelpers.detectControls;
                var getControlClasses = olHelpers.getControlClasses;
                var controls = olScope.controls;

                for (var control in defaults.controls) {
                    if (!controls.hasOwnProperty(control)) {
                        controls[control] = defaults.controls[control];
                    }
                }

                olScope.$watch('controls', function(controls) {
                    var actualControls = detectControls(map.getControls());
                    var controlClasses = getControlClasses();
                    var c;

                    // Delete the controls removed
                    for (c in actualControls) {
                        if (!controls.hasOwnProperty(c) || controls[c] === false) {
                            map.removeControl(actualControls[c]);
                            delete actualControls[c];
                        }
                    }

                    for (c in controls) {
                        if (controls[c] === true && !actualControls.hasOwnProperty(c)) {
                            map.addControl(new controlClasses[c]());
                        }
                    }
                }, true);
            });
        }
    };
}]);

angular.module('openlayers-directive')
       .directive('markers', ["$log", "$q", "olData", "olMapDefaults", "olHelpers", function($log, $q, olData, olMapDefaults, olHelpers) {
    return {
        restrict: 'A',
        scope: false,
        replace: false,
        require: ['openlayers', '?layers'],

        link: function(scope, element, attrs, controller) {
            var mapController = controller[0];
            var isDefined = olHelpers.isDefined;
            var olScope  = mapController.getOpenlayersScope();
            var createMarkerLayer = olHelpers.createMarkerLayer;
            var createMarker = olHelpers.createMarker;

            mapController.getMap().then(function(map) {
                var olMarkers = {};
                var getLayers;

                // If the layers attribute is used, we must wait until the layers are created
                if (isDefined(controller[1])) {
                    getLayers = controller[1].getLayers;
                } else {
                    getLayers = function() {
                        var deferred = $q.defer();
                        deferred.resolve();
                        return deferred.promise;
                    };
                }

                getLayers().then(function() {
                    olData.setMarkers(olMarkers, attrs.id);

                    // Create the markers layer and add it to the map
                    var markerLayer = createMarkerLayer();

                    olScope.$watch('markers', function(newMarkers) {
                        // Delete markers from the array
                        for (var name in olMarkers) {
                            if (!isDefined(olMarkers) || !isDefined(newMarkers[name])) {
                                markerLayer.getSource().removeFeature(olMarkers[name]);
                                delete olMarkers[name];
                            }
                        }

                        // add new markers
                        for (var newName in newMarkers) {
                            if (newName.search('-') !== -1) {
                                $log.error('[AngularJS - Openlayers] The marker can\'t use a "-" on ' +
                                           'his key name: "' + newName + '".');
                                continue;
                            }

                            if (!isDefined(olMarkers[newName])) {
                                var markerData = newMarkers[newName];
                                var marker = createMarker(markerData);
                                if (!isDefined(marker)) {
                                    $log.error('[AngularJS - Openlayers] Received invalid data on ' +
                                               'the marker ' + newName + '.');
                                    continue;
                                }
                                olMarkers[newName] = marker;
                                markerLayer.getSource().addFeature(marker);
                            }
                        }
                        map.addLayer(markerLayer);
                    }, true);
                });
            });
        }
    };
}]);

angular.module('openlayers-directive').service('olData', ["$log", "$q", "olHelpers", function($log, $q, olHelpers) {
    var obtainEffectiveMapId = olHelpers.obtainEffectiveMapId;

    var maps = {};
    var layers = {};
    var markers = {};

    var setResolvedDefer = function(d, mapId) {
        var id = obtainEffectiveMapId(d, mapId);
        d[id].resolvedDefer = true;
    };

    var getUnresolvedDefer = function(d, mapId) {
        var id = obtainEffectiveMapId(d, mapId);
        var defer;

        if (!angular.isDefined(d[id]) || d[id].resolvedDefer === true) {
            defer = $q.defer();
            d[id] = {
                defer: defer,
                resolvedDefer: false
            };
        } else {
            defer = d[id].defer;
        }
        return defer;
    };

    var getDefer = function(d, mapId) {
        var id = obtainEffectiveMapId(d, mapId);
        var defer;

        if (!angular.isDefined(d[id]) || d[id].resolvedDefer === false) {
            defer = getUnresolvedDefer(d, mapId);
        } else {
            defer = d[id].defer;
        }
        return defer;
    };

    this.setMap = function(olMap, scopeId) {
        var defer = getUnresolvedDefer(maps, scopeId);
        defer.resolve(olMap);
        setResolvedDefer(maps, scopeId);
    };

    this.getMap = function(scopeId) {
        var defer = getDefer(maps, scopeId);
        return defer.promise;
    };

    this.getLayers = function(scopeId) {
        var defer = getDefer(layers, scopeId);
        return defer.promise;
    };

    this.setLayers = function(olLayers, scopeId) {
        var defer = getUnresolvedDefer(layers, scopeId);
        defer.resolve(olLayers);
        setResolvedDefer(layers, scopeId);
    };

    this.getMarkers = function(scopeId) {
        var defer = getDefer(markers, scopeId);
        return defer.promise;
    };

    this.setMarkers = function(olMarkers, scopeId) {
        var defer = getUnresolvedDefer(markers, scopeId);
        defer.resolve(olMarkers);
        setResolvedDefer(markers, scopeId);
    };

}]);

angular.module('openlayers-directive').factory('olHelpers', ["$q", "$log", function($q, $log) {
    var isDefined = function(value) {
        return angular.isDefined(value);
    };

    var bingImagerySets = [
      'Road',
      'Aerial',
      'AerialWithLabels',
      'collinsBart',
      'ordnanceSurvey'
    ];

    var getControlClasses = function() {
        return {
            attribution: ol.control.Attribution,
            fullscreen: ol.control.FullScreen,
            mouseposition: ol.control.MousePosition,
            rotate: ol.control.Rotate,
            scaleline: ol.control.ScaleLine,
            zoom: ol.control.Zoom,
            zoomslider: ol.control.ZoomSlider,
            zoomtoextent: ol.control.ZoomToExtent
        };
    };

    var mapQuestLayers = ['osm', 'sat', 'hyb'];

    var createStyle = function(style) {
        var fill;
        var stroke;
        if (style.fill) {
            fill = new ol.style.Fill({
                color: style.fill.color
            });
        }

        if (style.stroke) {
            stroke = new ol.style.Stroke({
                color: style.stroke.color,
                width: style.stroke.width
            });
        }
        return new ol.style.Style({
            fill: fill,
            stroke: stroke
        });
    };

    var _detectLayerType = function(layer) {
        if (layer.type) {
            return layer.type;
        } else {
            switch (layer.source.type) {
                case 'ImageStatic':
                    return 'Image';
                case 'GeoJSON':
                    return 'Vector';
                case 'TopoJSON':
                    return 'Vector';
                default:
                    return 'Tile';
            }
        }
    };

    var createProjection = function(projection) {
        var oProjection;

        switch (projection) {
            case 'EPSG:3857':
                oProjection = new ol.proj.get(projection);
                break;
            case 'pixel':
                oProjection = new ol.proj.Projection({
                    code: 'pixel',
                    units: 'pixels',
                    extent: [0, 0, 4500, 2234]
                });
                break;
        }

        return oProjection;
    };

    var isValidStamenLayer = function(layer) {
        return ['watercolor', 'terrain', 'toner'].indexOf(layer) !== -1;
    };

    var createSource = function(source, projection) {
        var oSource;

        switch (source.type) {
            case 'OSM':
                if (source.attribution) {
                    oSource = new ol.source.OSM({
                        attributions: [
                          new ol.Attribution({ html: source.attribution }),
                          ol.source.OSM.DATA_ATTRIBUTION
                        ]
                    });
                } else {
                    oSource = new ol.source.OSM();
                }

                if (source.url) {
                    oSource.setUrl(source.url);
                }

                break;
            case 'BingMaps':
                if (!source.key) {
                    $log.error('[AngularJS - Openlayers] - You need an API key to show the Bing Maps.');
                    return;
                }

                oSource = new ol.source.BingMaps({
                    key: source.key,
                    imagerySet: source.imagerySet ? source.imagerySet : bingImagerySets[0]
                });

                break;

            case 'MapQuest':
                if (!source.layer || mapQuestLayers.indexOf(source.layer) === -1) {
                    $log.error('[AngularJS - Openlayers] - MapQuest layers needs a valid \'layer\' property.');
                    return;
                }

                oSource = new ol.source.MapQuest({
                    layer: source.layer
                });

                break;

            case 'GeoJSON':
                if (!(source.features || source.url)) {
                    $log.error('[AngularJS - Openlayers] - You need a GeoJSON features ' +
                               'property to add a GeoJSON layer.');
                    return;
                }

                if (source.url) {
                    oSource = new ol.source.GeoJSON({
                        projection: projection,
                        url: source.url
                    });
                } else {
                    oSource = new ol.source.GeoJSON(source.geojson);
                }

                break;
            case 'TopoJSON':
                if (!(source.features || source.url)) {
                    $log.error('[AngularJS - Openlayers] - You need a TopoJSON features ' +
                               'property to add a GeoJSON layer.');
                    return;
                }

                if (source.url) {
                    oSource = new ol.source.TopoJSON({
                        projection: projection,
                        url: source.url
                    });
                } else {
                    oSource = new ol.source.TopoJSON(source.topojson);
                }
                break;
            case 'TileJSON':
                oSource = new ol.source.TileJSON({
                    url: source.url,
                    crossOrigin: 'anonymous'
                });
                break;
            case 'KML':
                oSource = new ol.source.KML({
                    url: source.url,
                    projection: source.projection,
                    radius: source.radius,
                    extractStyles: false,
                });
                break;
            case 'Stamen':
                if (!source.layer || !isValidStamenLayer(source.layer)) {
                    $log.error('[AngularJS - Openlayers] - You need a valid Stamen layer.');
                    return;
                }
                oSource = new ol.source.Stamen({
                    layer: source.layer
                });
                break;
            case 'ImageStatic':
                if (!source.url || !angular.isArray(source.imageSize) || source.imageSize.length !== 2) {
                    $log.error('[AngularJS - Openlayers] - You need a image URL to create a ImageStatic layer.');
                    return;
                }

                oSource = new ol.source.ImageStatic({
                    url: source.url,
                    imageSize: source.imageSize,
                    projection: projection,
                    imageExtent: projection.getExtent()
                });
                break;
        }

        return oSource;
    };

    return {
        // Determine if a reference is defined
        isDefined: isDefined,

        // Determine if a reference is a number
        isNumber: function(value) {
            return angular.isNumber(value);
        },

        createProjection: createProjection,

        // Determine if a reference is defined and not null
        isDefinedAndNotNull: function(value) {
            return angular.isDefined(value) && value !== null;
        },

        // Determine if a reference is a string
        isString: function(value) {
            return angular.isString(value);
        },

        // Determine if a reference is an array
        isArray: function(value) {
            return angular.isArray(value);
        },

        // Determine if a reference is an object
        isObject: function(value) {
            return angular.isObject(value);
        },

        // Determine if two objects have the same properties
        equals: function(o1, o2) {
            return angular.equals(o1, o2);
        },

        isValidCenter: function(center) {
            return angular.isDefined(center) &&
                   (angular.isNumber(center.lat) && angular.isNumber(center.lon) ||
                   (angular.isArray(center.coord) && center.coord.length === 2 &&
                    angular.isNumber(center.coord[0]) && angular.isNumber(center.coord[1])) ||
                   (angular.isArray(center.bounds) && center.bounds.length === 4 &&
                   angular.isNumber(center.bounds[0]) && angular.isNumber(center.bounds[1]) &&
                   angular.isNumber(center.bounds[1]) && angular.isNumber(center.bounds[2])));
        },

        safeApply: function($scope, fn) {
            var phase = $scope.$root.$$phase;
            if (phase === '$apply' || phase === '$digest') {
                $scope.$eval(fn);
            } else {
                $scope.$apply(fn);
            }
        },

        isSameCenterOnMap: function(center, map) {
            var mapCenter = map.getView().getCenter();
            var zoom = map.getView().getZoom();
            if (mapCenter[1].toFixed(4) === center.lat.toFixed(4) &&
                mapCenter[1].toFixed(4) === center.lon.toFixed(4) &&
                zoom === center.zoom) {
                return true;
            }
            return false;
        },

        obtainEffectiveMapId: function(d, mapId) {
            var id;
            var i;
            if (!angular.isDefined(mapId)) {
                if (Object.keys(d).length === 1) {
                    for (i in d) {
                        if (d.hasOwnProperty(i)) {
                            id = i;
                        }
                    }
                } else if (Object.keys(d).length === 0) {
                    id = 'main';
                } else {
                    $log.error('[AngularJS - Openlayers] - You have more than 1 map on the DOM, ' +
                               'you must provide the map ID to the olData.getXXX call');
                }
            } else {
                id = mapId;
            }
            return id;
        },

        generateUniqueUID: function() {
            function s4() {
                return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
            }

            return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
        },

        createStyle: createStyle,

        setEvents: function(events, map, scope, layers) {
            if (isDefined(events)) {
                if (isDefined(layers)) {
                    if (isDefined(events.layers) && angular.isArray(events.layers.vector)) {
                        angular.forEach(events.layers.vector, function(eventType) {
                            angular.element(map.getViewport()).on(eventType, function(evt) {
                                var pixel = map.getEventPixel(evt);
                                var feature = map.forEachFeatureAtPixel(pixel, function(feature) {
                                    return feature;
                                });
                                scope.$emit('openlayers.geojson.' + eventType, feature);
                            });
                        });
                    }
                }
            }
        },

        detectLayerType: _detectLayerType,

        createLayer: function(layer, projection) {
            var oLayer;
            var type = _detectLayerType(layer);
            var oSource = createSource(layer.source, projection);

            if (!oSource) {
                return;
            }

            switch (type) {
                case 'Image':
                    oLayer = new ol.layer.Image({ source: oSource });
                    break;
                case 'Tile':
                    oLayer = new ol.layer.Tile({ source: oSource });
                    break;
                case 'Heatmap':
                    oLayer = new ol.layer.Heatmap({ source: oSource });
                    break;
                case 'Vector':
                    var style;
                    if (layer.style) {
                        style = createStyle(layer.style);
                    }
                    oLayer = new ol.layer.Vector({ source: oSource, style: style });
                    break;
            }

            if (angular.isNumber(layer.opacity)) {
                oLayer.setOpacity(layer.opacity);
            }
            return oLayer;
        },

        createMarkerLayer: function() {
            return new ol.layer.Vector({
                source: new ol.source.Vector()
            });
        },

        notifyCenterUrlHashChanged: function(scope, center, search) {
            if (center.centerUrlHash) {
                var centerUrlHash = center.lat.toFixed(4) + ":" + center.lon.toFixed(4) + ":" + center.zoom;
                if (!isDefined(search.c) || search.c !== centerUrlHash) {
                    scope.$emit("centerUrlHash", centerUrlHash);
                }
            }
        },

        getControlClasses: getControlClasses,

        detectControls: function(controls) {
            var actualControls = {};
            var controlClasses = getControlClasses();

            controls.forEach(function(control) {
                for (var i in controlClasses) {
                    if (control instanceof controlClasses[i]) {
                        actualControls[i] = control;
                    }
                }
            });

            return actualControls;
        },

        createMarker: function(markerData) {
            if (!isDefined(markerData)) {
                $log.error('[AngularJS - OpenLayers] The marker definition is not valid.');
                return;
            }

            var geometry = new ol.geom.Point([markerData.lon, markerData.lat]).transform('EPSG:4326', 'EPSG:3857');
            var marker = new ol.Feature({
                geometry: geometry
            });

            var style;
            if (!markerData.style) {
                var base64icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAGmklEQVRYw' +
                                 '7VXeUyTZxjvNnfELFuyIzOabermMZEeQC/OclkO49CpOHXOLJl/CAURuYbQi3KLgEhbrhZ1aDwmaoGq' +
                                 'KII6odATmH/scDFbdC7LvFqOCc+e95s2VG50X/LLm/f4/Z7neY/ne18aANCmAr5E/xZf1uDOkTcGcWR' +
                                 '6hl9247tT5U7Y6SNvWsKT63P58qbfeLJG8M5qcgTknrvvrdDbsT7Ml+tv82X6vVxJE33aRmgSyYtcWV' +
                                 'MqX97Yv2JvW39UhRE2HuyBL+t+gK1116ly06EeWFNlAmHxlQE0OMiV6mQCScusKRlhS3QLeVJdl1+23' +
                                 'h5dY4FNB3thrbYboqptEFlphTC1hSpJnbRvxP4NWgsE5Jyz86QNNi/5qSUTGuFk1gu54tN9wuK2wc3o' +
                                 '+Wc13RCmsoBwEqzGcZsxsvCSy/9wJKf7UWf1mEY8JWfewc67UUoDbDjQC+FqK4QqLVMGGR9d2wurKzq' +
                                 'Bk3nqIT/9zLxRRjgZ9bqQgub+DdoeCC03Q8j+0QhFhBHR/eP3U/zCln7Uu+hihJ1+bBNffLIvmkyP0g' +
                                 'pBZWYXhKussK6mBz5HT6M1Nqpcp+mBCPXosYQfrekGvrjewd59/GvKCE7TbK/04/ZV5QZYVWmDwH1mF' +
                                 '3xa2Q3ra3DBC5vBT1oP7PTj4C0+CcL8c7C2CtejqhuCnuIQHaKHzvcRfZpnylFfXsYJx3pNLwhKzRAw' +
                                 'AhEqG0SpusBHfAKkxw3w4627MPhoCH798z7s0ZnBJ/MEJbZSbXPhER2ih7p2ok/zSj2cEJDd4CAe+5W' +
                                 'YnBCgR2uruyEw6zRoW6/DWJ/OeAP8pd/BGtzOZKpG8oke0SX6GMmRk6GFlyAc59K32OTEinILRJRcha' +
                                 'h8HQwND8N435Z9Z0FY1EqtxUg+0SO6RJ/mmXz4VuS+DpxXC3gXmZwIL7dBSH4zKE50wESf8qwVgrP1E' +
                                 'IlTO5JP9Igu0aexdh28F1lmAEGJGfh7jE6ElyM5Rw/FDcYJjWhbeiBYoYNIpc2FT/SILivp0F1ipDWk' +
                                 '4BIEo2VuodEJUifhbiltnNBIXPUFCMpthtAyqws/BPlEF/VbaIxErdxPphsU7rcCp8DohC+GvBIPJS/' +
                                 'tW2jtvTmmAeuNO8BNOYQeG8G/2OzCJ3q+soYB5i6NhMaKr17FSal7GIHheuV3uSCY8qYVuEm1cOzqdW' +
                                 'r7ku/R0BDoTT+DT+ohCM6/CCvKLKO4RI+dXPeAuaMqksaKrZ7L3FE5FIFbkIceeOZ2OcHO6wIhTkNo0' +
                                 'ffgjRGxEqogXHYUPHfWAC/lADpwGcLRY3aeK4/oRGCKYcZXPVoeX/kelVYY8dUGf8V5EBRbgJXT5QIP' +
                                 'hP9ePJi428JKOiEYhYXFBqou2Guh+p/mEB1/RfMw6rY7cxcjTrneI1FrDyuzUSRm9miwEJx8E/gUmql' +
                                 'yvHGkneiwErR21F3tNOK5Tf0yXaT+O7DgCvALTUBXdM4YhC/IawPU+2PduqMvuaR6eoxSwUk75ggqsY' +
                                 'J7VicsnwGIkZBSXKOUww73WGXyqP+J2/b9c+gi1YAg/xpwck3gJuucNrh5JvDPvQr0WFXf0piyt8f8/' +
                                 'WI0hV4pRxxkQZdJDfDJNOAmM0Ag8jyT6hz0WGXWuP94Yh2jcfjmXAGvHCMslRimDHYuHuDsy2QtHuIa' +
                                 'vznhbYURq5R57KpzBBRZKPJi8eQg48h4j8SDdowifdIrEVdU+gbO6QNvRRt4ZBthUaZhUnjlYObNagV' +
                                 '3keoeru3rU7rcuceqU1mJBxy+BWZYlNEBH+0eH4vRiB+OYybU2hnblYlTvkHinM4m54YnxSyaZYSF6R' +
                                 '3jwgP7udKLGIX6r/lbNa9N6y5MFynjWDtrHd75ZvTYAPO/6RgF0k76mQla3FGq7dO+cH8sKn0Vo7nDl' +
                                 'lwAhqwLPkxrHwWmHJOo+AKJ4rab5OgrM7rVu8eWb2Pu0Dh4eDgXoOfvp7Y7QeqknRmvcTBEyq9m/HQQ' +
                                 'SCSz6LHq3z0yzsNySRfMS253wl2KyRDbcZPcfJKjZmSEOjcxyi+Y8dUOtsIEH6R2wNykdqrkYJ0RV92' +
                                 'H0W58pkfQk7cKevsLK10Py8SdMGfXNXATY+pPbyJR/ET6n9nIfztNtZYRV9XniQu9IA2vOVgy4ir7GC' +
                                 'LVmmd+zjkH0eAF9Po6K61pmCXHxU5rHMYd1ftc3owjwRSVRzLjKvqZEty6cRUD7jGqiOdu5HG6MdHjN' +
                                 'cNYGqfDm5YRzLBBCCDl/2bk8a8gdbqcfwECu62Fg/HrggAAAABJRU5ErkJggg==';

                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 1],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        opacity: 0.90,
                        src: base64icon
                    })
                });
            }

            marker.setStyle(style);
            return marker;
        }
    };
}]);

angular.module('openlayers-directive').factory('olMapDefaults', ["$q", "olHelpers", function($q, olHelpers) {
    var _getDefaults = function() {
        return {
            interactions: {
                dragRotate: true,
                doubleClickZoom: true,
                dragPan: true,
                pinchRotate: true,
                pinchZoom: true,
                keyboardPan: true,
                keyboardZoom: true,
                mouseWheelZoom: true,
                dragZoom: true
            },
            view: {
                projection: 'EPSG:4326',
                minZoom: undefined,
                maxZoom: undefined,
                rotation: 0
            },
            layers: {
                main: {
                    type: 'Tile',
                    source: {
                        type: 'OSM'
                    }
                }
            },
            center: {
                lat: 0,
                lon: 0,
                zoom: 1,
                autodiscover: false,
                bounds: [],
                centerUrlHash: false,
                projection: 'EPSG:3857'
            },
            controls: {
                attribution: true,
                rotate: false,
                zoom: true
            },
            events: {
                map: ['click']
            },
            renderer: 'canvas'
        };
    };

    var isDefined = olHelpers.isDefined;
    var obtainEffectiveMapId = olHelpers.obtainEffectiveMapId;
    var defaults = {};

    // Get the _defaults dictionary, and override the properties defined by the user
    return {
        getDefaults: function(scopeId) {
            var mapId = obtainEffectiveMapId(defaults, scopeId);
            return defaults[mapId];
        },

        setDefaults: function(userDefaults, scopeId) {
            var newDefaults = _getDefaults();

            if (isDefined(userDefaults)) {

                if (isDefined(userDefaults.layers)) {
                    newDefaults.layers = angular.copy(userDefaults.layers);
                }

                if (isDefined(userDefaults.controls)) {
                    newDefaults.controls = angular.copy(userDefaults.controls);
                }

                if (isDefined(userDefaults.interactions)) {
                    newDefaults.interactions = angular.copy(userDefaults.interactions);
                }

                if (isDefined(userDefaults.renderer)) {
                    newDefaults.renderer = userDefaults.renderer;
                }

                if (isDefined(userDefaults.view)) {
                    newDefaults.view.maxZoom = userDefaults.view.maxZoom || newDefaults.view.maxZoom;
                    newDefaults.view.minZoom = userDefaults.view.minZoom || newDefaults.view.minZoom;
                    newDefaults.view.projection = userDefaults.view.projection || newDefaults.view.projection;
                }

            }

            var mapId = obtainEffectiveMapId(defaults, scopeId);
            defaults[mapId] = newDefaults;
            return newDefaults;
        }
    };
}]);

}());