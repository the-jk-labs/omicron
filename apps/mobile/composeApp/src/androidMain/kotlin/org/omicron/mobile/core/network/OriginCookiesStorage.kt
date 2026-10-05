package org.omicron.mobile.core.network

import io.ktor.client.plugins.cookies.CookiesStorage
import io.ktor.http.Cookie
import io.ktor.http.Url
import io.ktor.util.date.GMTDate
import org.omicron.mobile.core.storage.SessionCookieStore
import org.omicron.mobile.core.storage.StoredSessionCookie

class OriginCookiesStorage(
    private val store: SessionCookieStore,
) : CookiesStorage {
    override suspend fun addCookie(requestUrl: Url, cookie: Cookie) {
        val origin = requestUrl.origin()
        val now = System.currentTimeMillis()
        val updated =
            store
                .read(origin)
                .filterNot { it.name == cookie.name }
                .plus(
                    StoredSessionCookie(
                        name = cookie.name,
                        value = cookie.value,
                        expiresAt =
                            cookie.expires?.timestamp
                                ?: cookie.maxAge?.let { now + it * 1_000 },
                    ),
                ).filter { it.expiresAt == null || it.expiresAt > now }
        store.write(origin, updated)
    }

    override suspend fun get(requestUrl: Url): List<Cookie> {
        val origin = requestUrl.origin()
        val now = System.currentTimeMillis()
        val cookies = store.read(origin).filter { it.expiresAt == null || it.expiresAt > now }
        store.write(origin, cookies)
        return cookies.map {
            Cookie(
                name = it.name,
                value = it.value,
                expires = it.expiresAt?.let(::GMTDate),
                domain = requestUrl.host,
                path = "/",
                secure = true,
                httpOnly = true,
            )
        }
    }

    override fun close() = Unit

    private fun Url.origin(): String =
        buildString {
            append(protocol.name)
            append("://")
            append(host)
            if (port != protocol.defaultPort) append(":$port")
        }
}
