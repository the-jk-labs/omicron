package org.omicron.mobile.core.storage

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.HomeSnapshot

class EncryptedHomeSnapshotStoreTest {
    @Test
    fun roundTripsEncryptedDataOutsideBackupAndClearsOnlyItsOwnFileAndKey() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = EncryptedHomeSnapshotStore(context, "home_snapshot_test", "omicron.test.home.snapshot")
        val file = File(context.noBackupFilesDir, "home_snapshot_test")
        try {
            val snapshot = HomeSnapshot("https://example.com", AuthenticatedUser("fixture-reader", "fixture@example.com", "fixture-reader", "Fixture reader"), 1)
            store.write(snapshot)

            assertEquals(snapshot, store.read())
            assertFalse(file.readBytes().decodeToString().contains("fixture-reader"))
            assertFalse(file.readBytes().decodeToString().contains("fixture@example.com"))
            file.writeBytes(byteArrayOf(1, 2, 3))
            assertNull(store.read())
            store.write(snapshot)
            store.clear()
            assertNull(store.read())
            assertFalse(file.exists())
        } finally {
            store.clear()
        }
    }
}
