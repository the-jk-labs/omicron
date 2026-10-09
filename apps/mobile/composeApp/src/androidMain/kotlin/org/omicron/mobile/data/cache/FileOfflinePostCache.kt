package org.omicron.mobile.data.cache

import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import org.omicron.mobile.domain.model.OwnPostStatus
import org.omicron.mobile.domain.model.PostDetail

class FileOfflinePostCache(
    private val directory: File,
    private val now: () -> Long = System::currentTimeMillis,
    private val maxEntries: Int = DEFAULT_MAX_ENTRIES,
    private val maxBytes: Long = DEFAULT_MAX_BYTES,
    private val maxAgeMillis: Long = DEFAULT_MAX_AGE_MILLIS,
) : OfflinePostCache {
    private val mutex = Mutex()
    private val json = Json { ignoreUnknownKeys = true }

    init {
        require(maxEntries > 0)
        require(maxBytes > 0)
        require(maxAgeMillis > 0)
    }

    override suspend fun read(origin: String, postId: String): CachedPostDetail? =
        withContext(Dispatchers.IO) {
            mutex.withLock {
                val file = fileFor(origin, postId)
                val record = readRecord(file) ?: return@withLock null
                if (record.origin != origin || record.post.id != postId || !record.isPublicArticle() || record.isExpired(now())) {
                    file.delete()
                    return@withLock null
                }
                file.setLastModified(now())
                record.toCachedPostDetail()
            }
        }

    override suspend fun entries(origin: String): List<CachedPostDetail> =
        withContext(Dispatchers.IO) {
            mutex.withLock {
                val currentTime = now()
                val valid = records(currentTime)
                valid.filter { it.first.origin == origin }
                    .sortedByDescending { it.second.lastModified() }
                    .map { it.first.toCachedPostDetail() }
            }
        }

    override suspend fun write(origin: String, post: PostDetail) {
        if (post.status != OwnPostStatus.Published) return
        withContext(Dispatchers.IO) {
            mutex.withLock {
                if (!directory.exists() && !directory.mkdirs()) return@withLock
                val record =
                    OfflinePostRecord(
                        origin = origin,
                        post = post.copy(liked = false, recommended = false, isOfflineCopy = false, cachedAtMillis = null),
                        cachedAtMillis = now(),
                    )
                val contents = json.encodeToString(record)
                val bytes = contents.encodeToByteArray()
                val file = fileFor(origin, post.id)
                if (bytes.size > maxBytes) {
                    file.delete()
                    records(now())
                    return@withLock
                }
                val temporary = File(directory, "${file.name}.tmp")
                temporary.writeBytes(bytes)
                file.delete()
                if (!temporary.renameTo(file)) {
                    temporary.delete()
                    throw IllegalStateException("Could not store an offline post")
                }
                file.setLastModified(record.cachedAtMillis)
                evictToLimits(now())
            }
        }
    }

    override suspend fun remove(origin: String, postId: String) {
        withContext(Dispatchers.IO) {
            mutex.withLock { fileFor(origin, postId).delete() }
        }
    }

    override suspend fun clear(origin: String) {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                val prefix = "${digest(origin)}-"
                directory.listFiles()
                    ?.filter { it.name.startsWith(prefix) && (it.name.endsWith(JSON_SUFFIX) || it.name.endsWith(TEMP_SUFFIX)) }
                    ?.forEach(File::delete)
            }
        }
    }

    private fun records(currentTime: Long): List<Pair<OfflinePostRecord, File>> {
        val records = mutableListOf<Pair<OfflinePostRecord, File>>()
        directory.listFiles()?.forEach { file ->
            when {
                file.name.endsWith(TEMP_SUFFIX) -> file.delete()
                file.name.endsWith(JSON_SUFFIX) -> {
                    val record = readRecord(file)
                    if (record == null || !record.isPublicArticle() || record.isExpired(currentTime)) {
                        file.delete()
                    } else {
                        records += record to file
                    }
                }
            }
        }
        return records
    }

    private fun evictToLimits(currentTime: Long) {
        val records = records(currentTime).sortedBy { it.second.lastModified() }.toMutableList()
        var bytes = records.sumOf { it.second.length() }
        while (records.size > maxEntries || bytes > maxBytes) {
            val eldest = records.removeAt(0)
            bytes -= eldest.second.length()
            eldest.second.delete()
        }
    }

    private fun readRecord(file: File): OfflinePostRecord? =
        runCatching { json.decodeFromString<OfflinePostRecord>(file.readText()) }.getOrNull()

    private fun fileFor(origin: String, postId: String): File =
        File(directory, "${digest(origin)}-${digest(postId)}$JSON_SUFFIX")

    private fun OfflinePostRecord.isExpired(currentTime: Long): Boolean =
        currentTime - cachedAtMillis > maxAgeMillis

    private fun OfflinePostRecord.isPublicArticle(): Boolean = post.status == OwnPostStatus.Published

    private fun OfflinePostRecord.toCachedPostDetail() =
        CachedPostDetail(
            post = post.copy(liked = false, recommended = false, isOfflineCopy = true, cachedAtMillis = cachedAtMillis),
            cachedAtMillis = cachedAtMillis,
        )

    private fun digest(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.encodeToByteArray())
            .joinToString(separator = "") { byte -> "%02x".format(byte) }

    @Serializable
    private data class OfflinePostRecord(
        val origin: String,
        val post: PostDetail,
        val cachedAtMillis: Long,
    )

    private companion object {
        const val JSON_SUFFIX = ".json"
        const val TEMP_SUFFIX = ".tmp"
        const val DEFAULT_MAX_ENTRIES = 50
        const val DEFAULT_MAX_BYTES = 64L * 1024 * 1024
        const val DEFAULT_MAX_AGE_MILLIS = 30L * 24 * 60 * 60 * 1000
    }
}
