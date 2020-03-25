import VectorTileSource from "./vector_tile_source";

class FourWindsVectorTileSource extends VectorTileSource {
    constructor(id, options, dispatcher, eventedParent) {
        // options.type = 'fourwinds'
        super(id, options, dispatcher, eventedParent);
        this.type = 'fourwinds'
    }
}

export default FourWindsVectorTileSource;
