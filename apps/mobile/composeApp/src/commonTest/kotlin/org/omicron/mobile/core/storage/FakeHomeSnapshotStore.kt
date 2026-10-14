package org.omicron.mobile.core.storage

import org.omicron.mobile.domain.model.HomeSnapshot

class FakeHomeSnapshotStore(var snapshot: HomeSnapshot? = null) : HomeSnapshotStore {
    var readFailure: Throwable? = null
    var writeFailure: Throwable? = null
    override suspend fun read(): HomeSnapshot? {
        readFailure?.let { throw it }
        return snapshot
    }

    override suspend fun write(snapshot: HomeSnapshot) {
        writeFailure?.let { throw it }
        this.snapshot = snapshot
    }

    override suspend fun clear() {
        snapshot = null
    }
}
