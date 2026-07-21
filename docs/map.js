/* ============================================================
   SAMIJAYA — map.js
   Leaflet Map Integration & Geocoding
   ============================================================ */

var _map = null;
var _marker = null;
var _mapRequestGeneration = 0;
var _placeSearchSequence = 0;
var _reverseGeocodeSequence = 0;
var _lastGeocodeFailure = '';
var MAP_NETWORK_TIMEOUT_MS = 9000;
// Fallback origin (Cirebon area) if admin hasn't set any pickup location with valid coords
var ORIGIN_FALLBACK = { lat: -6.7320, lng: 108.5523 };

function initDeliveryMap(containerId, onPinMoved, initialLat, initialLng) {
  _mapRequestGeneration++;
  var container = document.getElementById(containerId);
  if (!container) return null;

  if (_map) {
    _map.remove();
    _map = null;
    _marker = null;
  }

  var origin = getOriginLatLng(initialLat, initialLng);
  var lat = initialLat || origin.lat;
  var lng = initialLng || origin.lng;
  if (!container) return null;

  _map = L.map(containerId).setView([lat, lng], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(_map);

  _marker = L.marker([lat, lng], { draggable: true }).addTo(_map);

  _marker.on('dragend', function (e) {
    var pos = _marker.getLatLng();
    if (onPinMoved) onPinMoved(pos.lat, pos.lng);
  });

  return _map;
}

function invalidateMapRequests() {
  _mapRequestGeneration++;
  _placeSearchSequence++;
  _reverseGeocodeSequence++;
}

function mapFetchJson(url, timeoutMs) {
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var settled = false, timer = null;
  return new Promise(function(resolve, reject) {
    timer = setTimeout(function() {
      if (settled) return;
      settled = true;
      if (controller) try { controller.abort(); } catch (_) {}
      var timeoutError = new Error('MAP_TIMEOUT'); timeoutError.kind = 'TIMEOUT'; reject(timeoutError);
    }, timeoutMs || MAP_NETWORK_TIMEOUT_MS);
    var options = controller ? { signal: controller.signal } : {};
    Promise.resolve().then(function() { return fetch(url, options); }).then(function(response) {
      if (settled) return;
      if (!response || !response.ok) { var httpError = new Error('MAP_HTTP'); httpError.kind = 'HTTP'; throw httpError; }
      return response.json();
    }).then(function(data) {
      if (settled) return;
      settled = true; clearTimeout(timer); timer = null; resolve(data);
    }).catch(function(error) {
      if (settled) return;
      settled = true; clearTimeout(timer); timer = null;
      if (error && error.name === 'AbortError') error.kind = 'TIMEOUT';
      if (!error.kind) error.kind = 'NETWORK';
      reject(error);
    });
  });
}

function getOriginLatLng(targetLat, targetLng) {
  if (typeof catalog !== 'undefined' && catalog && catalog.pickupLocations) {
    var bestOrigin = null;
    var minDistance = Infinity;

    for (var i = 0; i < catalog.pickupLocations.length; i++) {
      var loc = catalog.pickupLocations[i];
      if (loc.latitude && loc.longitude && (loc.latitude != 0 || loc.longitude != 0)) {
        var oLat = Number(loc.latitude);
        var oLng = Number(loc.longitude);
        if (targetLat != null && targetLng != null) {
          var d = haversineKm(oLat, oLng, targetLat, targetLng);
          if (d < minDistance) {
            minDistance = d;
            bestOrigin = { lat: oLat, lng: oLng };
          }
        } else {
          return { lat: oLat, lng: oLng };
        }
      }
    }
    if (bestOrigin) return bestOrigin;
  }
  return ORIGIN_FALLBACK;
}

async function searchPlacePhoton(query) {
  var sequence = ++_placeSearchSequence;
  var generation = _mapRequestGeneration;
  var origin = getOriginLatLng();
  var url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(query) + '&lat=' + origin.lat + '&lon=' + origin.lng + '&limit=5&lang=id';
  try {
    var data = await mapFetchJson(url, MAP_NETWORK_TIMEOUT_MS);
    if (sequence !== _placeSearchSequence || generation !== _mapRequestGeneration) { var stale = []; stale.error_category = 'STALE'; return stale; }
    var results = [];
    if (data && data.features) {
      for (var i = 0; i < data.features.length; i++) {
        var prop = data.features[i].properties;
        var geom = data.features[i].geometry;
        var label = prop.name || '';
        if (prop.city) label += ', ' + prop.city;
        else if (prop.state) label += ', ' + prop.state;
        if (!label) continue;
        results.push({
          label: label,
          lat: geom.coordinates[1],
          lng: geom.coordinates[0]
        });
      }
    }
    
    if (results.length > 0) {
      return results;
    } else {
      throw new Error("Photon empty result");
    }
  } catch (e) {
    // Fallback to Nominatim
    var nomUrl = 'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=5&countrycodes=id';
    try {
      var nomData = await mapFetchJson(nomUrl, MAP_NETWORK_TIMEOUT_MS);
      if (sequence !== _placeSearchSequence || generation !== _mapRequestGeneration) { var staleFallback = []; staleFallback.error_category = 'STALE'; return staleFallback; }
      var nomResults = [];
      for (var j = 0; j < nomData.length; j++) {
        nomResults.push({
          label: nomData[j].display_name,
          lat: parseFloat(nomData[j].lat),
          lng: parseFloat(nomData[j].lon)
        });
      }
      if (!nomResults.length) nomResults.error_category = 'NOT_FOUND';
      return nomResults;
    } catch (err) {
      var failed = [];
      failed.error_category = err && err.kind === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK';
      return failed;
    }
  }
}

async function reverseGeocode(lat, lng) {
  var sequence = ++_reverseGeocodeSequence;
  var generation = _mapRequestGeneration;
  var url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=1';
  try {
    var data = await mapFetchJson(url, MAP_NETWORK_TIMEOUT_MS);
    if (sequence !== _reverseGeocodeSequence || generation !== _mapRequestGeneration) { _lastGeocodeFailure = 'STALE'; return ""; }
    _lastGeocodeFailure = data && data.display_name ? '' : 'NOT_FOUND';
    return data.display_name || "";
  } catch (e) {
    _lastGeocodeFailure = e && e.kind === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK';
    return "";
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2 - lat1);
  var dLon = deg2rad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

function hitungOngkir(jarakKmLurus) {
  var settings = (typeof catalog !== 'undefined' && catalog && catalog.settings) ? catalog.settings : {};
  var faktor = Number(settings.ONGKIR_FAKTOR_KOREKSI || 1.3);
  var tarif = Number(settings.ONGKIR_PER_KM || 1000);
  
  var jarak_terkoreksi = jarakKmLurus * faktor;
  var ongkir;
  if (jarak_terkoreksi <= 5) {
    ongkir = 0;
  } else {
    ongkir = Math.round(jarak_terkoreksi) * tarif;
  }
  
  return {
    jarak_km: Number(jarak_terkoreksi.toFixed(2)),
    ongkir: ongkir
  };
}
