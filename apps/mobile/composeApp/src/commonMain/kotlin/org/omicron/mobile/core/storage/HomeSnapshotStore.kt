package org.omicron.mobile.core.storage

import org.omicron.mobile.domain.model.HomeSnapshot

interface HomeSnapshotStore {
    suspend fun read(): HomeSnapshot?

    suspend fun write(snapshot: HomeSnapshot)

    suspend fun clear()

    companion object {
        const val MAX_BYTES = 1_048_576
    }
}
