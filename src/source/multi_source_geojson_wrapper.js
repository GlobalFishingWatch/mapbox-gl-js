// @flow

import GeoJSONWrapper from './geojson_wrapper';

class MultiSourceLayerGeoJSONWrapper implements VectorTile, VectorTileLayer {
  constructor(sourceLayers, options = {}) {
      const { extent = EXTENT } = options
      const layers = {}
      Object.keys(sourceLayers).forEach(sourceLayerName => {
          layers[sourceLayerName] = new GeoJSONWrapper(sourceLayers[sourceLayerName].features, {
              name: sourceLayerName,
              extent
          });
      })
      this.layers = layers
  }
}

export default MultiSourceLayerGeoJSONWrapper;
