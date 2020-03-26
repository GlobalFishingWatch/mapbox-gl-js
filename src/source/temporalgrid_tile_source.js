import {extend, pick} from '../util/util';
import {ResourceType} from '../util/ajax';
import browser from '../util/browser';
import {cacheEntryPossiblyAdded} from '../util/tile_request_cache';
import VectorTileSource from "./vector_tile_source";

// import type {Source} from './source';
// import type Dispatcher from '../util/dispatcher';
// import type Tile from './tile';
// import type {Callback} from '../types/callback';
// import type {Cancelable} from '../types/cancelable';
// import type {
//     TemporalGridSourceSpecification,
//     PromoteIdSpecification
// } from "../style-spec/types";

class TemporalGridVectorTileSource extends VectorTileSource {
    constructor(id, options, dispatcher, eventedParent) {
        super(id, options, dispatcher, eventedParent);
        this.type = "temporalgrid";
        this.aggregationConfig = options.aggregationConfig;
    }

    loadTile(tile, callback) {
        const url = this.map._requestManager.normalizeTileURL(
            tile.tileID.canonical.url(this.tiles, this.scheme)
        );
        const params = {
            request: this.map._requestManager.transformRequest(
                url,
                ResourceType.Tile
            ),
            uid: tile.uid,
            tileID: tile.tileID,
            zoom: tile.tileID.overscaledZ,
            tileSize: this.tileSize * tile.tileID.overscaleFactor(),
            type: this.type,
            source: this.id,
            pixelRatio: browser.devicePixelRatio,
            showCollisionBoxes: this.map.showCollisionBoxes,
            promoteId: this.promoteId,
            aggregationConfig: this.aggregationConfig
        };
        params.request.collectResourceTiming = this._collectResourceTiming;

        if (!tile.actor || tile.state === "expired") {
            tile.actor = this.dispatcher.getActor();
            tile.request = tile.actor.send("loadTile", params, done.bind(this));
        } else if (tile.state === "loading") {
            // schedule tile reloading after it has been loaded
            tile.reloadCallback = callback;
        } else {
            tile.request = tile.actor.send(
                "reloadTile",
                params,
                done.bind(this)
            );
        }

        function done(err, data) {
            delete tile.request;

            if (tile.aborted) return callback(null);

            if (err && err.status !== 404) {
                return callback(err);
            }

            if (data && data.resourceTiming)
                tile.resourceTiming = data.resourceTiming;

            if (this.map._refreshExpiredTiles && data) tile.setExpiryData(data);
            tile.loadVectorData(data, this.map.painter);

            cacheEntryPossiblyAdded(this.dispatcher);
            callback(null);

            if (tile.reloadCallback) {
                this.loadTile(tile, tile.reloadCallback);
                tile.reloadCallback = null;
            }
        }
    }
}

export default TemporalGridVectorTileSource;
