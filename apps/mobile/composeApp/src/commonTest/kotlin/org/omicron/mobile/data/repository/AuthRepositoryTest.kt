package org.omicron.mobile.data.repository

import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.io.IOException
import kotlinx.serialization.json.buildJsonObject
import org.omicron.mobile.data.api.AuthApi
import org.omicron.mobile.data.api.AuthApiException
import org.omicron.mobile.data.api.AuthSessionDto
import org.omicron.mobile.data.api.AuthSessionCreationDto
import org.omicron.mobile.data.api.AuthTokenDto
import org.omicron.mobile.data.api.AuthUserDto
import org.omicron.mobile.core.storage.SessionCookieStore
import org.omicron.mobile.core.storage.StoredSessionCookie
import org.omicron.mobile.core.storage.FakeHomeSnapshotStore
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.HomeSnapshot
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AuthRepositoryTest {
    @Test
    fun mintsAndKeepsAnInMemoryTokenForTheRestoredSession() = runTest {
        val repository = AuthRepository(FakeAuthApi(session = session()), FakeSessionCookieStore())

        val restored = repository.restore("https://omicron.blog")

        assertEquals("signed-token", restored?.accessToken)
        assertEquals("ada", restored?.user?.username)
        assertEquals(restored, repository.currentSession())
    }

    @Test
    fun clearsAnExistingTokenWhenNoSessionCanBeRestored() = runTest {
        val api = FakeAuthApi(session = session())
        val repository = AuthRepository(api, FakeSessionCookieStore())
        repository.restore("https://omicron.blog")
        api.session = null

        assertNull(repository.restore("https://omicron.blog"))
        assertNull(repository.currentSession())
    }

    @Test
    fun restoresToSignInWhenTheSavedSessionCannotMintAToken() = runTest {
        val origin = "https://omicron.blog"
        val api = FakeAuthApi(session = session(), tokenFailure = AuthApiException("UNAUTHORIZED"))
        val cookieStore = FakeSessionCookieStore()
        cookieStore.write(origin, listOf(StoredSessionCookie("session", "secret", null)))
        val repository = AuthRepository(api, cookieStore)

        assertNull(repository.restore(origin))
        assertNull(repository.currentSession())
        assertEquals(emptyList(), cookieStore.read(origin))
    }

    @Test
    fun clearsTheInMemorySessionWhenRemoteSignOutFails() = runTest {
        val api = FakeAuthApi(session = session(), signOutFailure = IllegalStateException("offline"))
        val cookieStore = FakeSessionCookieStore()
        val origin = "https://omicron.blog"
        cookieStore.write(origin, listOf(StoredSessionCookie("session", "secret", null)))
        val repository = AuthRepository(api, cookieStore)
        repository.restore(origin)

        runCatching { repository.signOut(origin) }

        assertNull(repository.currentSession())
        assertEquals(emptyList(), cookieStore.read(origin))
    }

    @Test
    fun returnsVerificationRequiredWhenSignInIsBlockedUntilConfirmation() = runTest {
        val repository = AuthRepository(FakeAuthApi(session = null, signInFailure = AuthApiException("EMAIL_NOT_VERIFIED")), FakeSessionCookieStore())

        val result = repository.signInEmail("https://omicron.blog", "ada@example.com", "Unique-test-password-123!")

        assertIs<AuthenticationResult.VerificationRequired>(result)
    }

    @Test
    fun returnsInvalidCredentialsWithoutTreatingThemAsAnAvailabilityFailure() = runTest {
        val repository = AuthRepository(FakeAuthApi(session = null, signInFailure = AuthApiException("INVALID_USERNAME_OR_PASSWORD")), FakeSessionCookieStore())

        val result = repository.signInUsername("https://omicron.blog", "ada", "Unique-test-password-123!")

        assertIs<AuthenticationResult.InvalidCredentials>(result)
    }

    @Test
    fun usesTheSignInResponseWhileMintingTheApiToken() = runTest {
        val repository = AuthRepository(FakeAuthApi(session = null, createSessionOnSignIn = false), FakeSessionCookieStore())

        val result = repository.signInUsername("https://omicron.blog", "ada", "Unique-test-password-123!")

        assertIs<AuthenticationResult.Authenticated>(result)
    }

    @Test
    fun returnsVerificationRequiredWhenRegistrationDoesNotCreateASession() = runTest {
        val repository = AuthRepository(FakeAuthApi(session = null, signUpToken = null), FakeSessionCookieStore())

        val result =
            repository.signUpEmail(
                origin = "https://omicron.blog",
                email = "ada@example.com",
                password = "Unique-test-password-123!",
                username = "ada",
                displayName = "Ada",
            )

        assertIs<AuthenticationResult.VerificationRequired>(result)
    }

    @Test
    fun refreshesTheTokenBeforeItExpiresAndOnlyForItsOrigin() = runTest {
        var now = 0L
        val api = FakeAuthApi(session = session())
        val repository = AuthRepository(api, FakeSessionCookieStore(), now = { now })
        repository.restore("https://omicron.blog")
        now = 14 * 60 * 1_000L
        api.accessToken = "refreshed-token"

        assertEquals("refreshed-token", repository.accessToken("https://omicron.blog"))
        assertNull(repository.accessToken("https://other.example"))
        assertEquals(2, api.tokenRequests)
    }

    @Test
    fun clearsTheSessionWhenMintingIsRejectedAsUnauthorized() = runTest {
        var now = 0L
        val api = FakeAuthApi(session = session())
        val repository = AuthRepository(api, FakeSessionCookieStore(), now = { now })
        repository.restore("https://omicron.blog")
        now = 14 * 60 * 1_000L
        api.tokenFailure = AuthApiException("UNAUTHORIZED")

        assertNull(repository.accessToken("https://omicron.blog"))
        assertNull(repository.currentSession())
        assertTrue(repository.sessionExpired.value)
    }

    @Test
    fun servesTheStaleTokenWhenMintingFailsTransiently() = runTest {
        var now = 0L
        val api = FakeAuthApi(session = session())
        val repository = AuthRepository(api, FakeSessionCookieStore(), now = { now })
        repository.restore("https://omicron.blog")
        now = 14 * 60 * 1_000L
        api.tokenFailure = IOException("offline")

        assertEquals("signed-token", repository.accessToken("https://omicron.blog"))

        now = 15 * 60 * 1_000L

        assertFailsWith<SessionRefreshUnavailableException> { repository.accessToken("https://omicron.blog") }
        assertNull(repository.currentSession())
        assertEquals("ada", repository.displayUser.value?.username)
        assertFalse(repository.sessionExpired.value)
    }

    @Test
    fun invalidatesTheInMemorySessionWithoutTouchingCookies() = runTest {
        val api = FakeAuthApi(session = session())
        val cookieStore = FakeSessionCookieStore()
        val origin = "https://omicron.blog"
        cookieStore.write(origin, listOf(StoredSessionCookie("session", "secret", null)))
        val repository = AuthRepository(api, cookieStore)
        repository.restore(origin)

        repository.invalidateSession()

        assertNull(repository.currentSession())
        assertEquals(listOf(StoredSessionCookie("session", "secret", null)), cookieStore.read(origin))
        assertTrue(repository.sessionExpired.value)
    }

    @Test
    fun explicitSignOutClearsTheExpiredSessionNotice() = runTest {
        val repository = AuthRepository(FakeAuthApi(session = session()), FakeSessionCookieStore())
        val origin = "https://omicron.blog"
        repository.restore(origin)
        repository.invalidateSession()
        assertTrue(repository.sessionExpired.value)

        repository.signOut(origin)

        assertFalse(repository.sessionExpired.value)
    }

    @Test
    fun exposesSessionChangesAsAFlow() = runTest {
        val repository = AuthRepository(FakeAuthApi(session = session()), FakeSessionCookieStore())

        assertNull(repository.session.value)

        repository.restore("https://omicron.blog")

        assertEquals("ada", repository.session.value?.user?.username)

        repository.invalidateSession()

        assertNull(repository.session.value)
    }

    @Test
    fun cachedIdentityIsPresentationOnlyAndRequestsWaitForAuthentication() = runTest {
        val origin = "https://omicron.blog"
        val cookies = FakeSessionCookieStore().apply { write(origin, listOf(StoredSessionCookie("session", "saved", null))) }
        val store = FakeHomeSnapshotStore(HomeSnapshot(origin, AuthenticatedUser("user-1", "ada@example.com", "ada", "Cached Ada"), 0))
        val gate = CompletableDeferred<AuthSessionDto?>()
        val api = FakeAuthApi(session()).apply { sessionResponse = { gate.await() } }
        val repository = AuthRepository(api, cookies, now = { 0 }, homeSnapshots = HomeSnapshotRepository(store, now = { 0 }))

        repository.prepareStartup(origin)
        assertEquals("Cached Ada", repository.displayUser.value?.displayName)
        assertNull(repository.currentSession())
        val token = async { repository.accessToken(origin) }
        val restoration = async { repository.restoreSavedSession(origin) }
        testScheduler.runCurrent()
        assertFalse(token.isCompleted)
        assertEquals(0, api.tokenRequests)
        gate.complete(session())
        testScheduler.advanceUntilIdle()

        assertEquals("signed-token", token.await())
        assertEquals("Ada", restoration.await()?.user?.displayName)
        assertEquals("Ada", store.snapshot?.user?.displayName)
    }

    @Test
    fun transientRestorationFailureKeepsCachedIdentityWithoutAuthorizingRequests() = runTest {
        val origin = "https://omicron.blog"
        val cookies = FakeSessionCookieStore().apply { write(origin, listOf(StoredSessionCookie("session", "saved", null))) }
        val store = FakeHomeSnapshotStore(HomeSnapshot(origin, AuthenticatedUser("user-1", "ada@example.com", "ada", "Ada"), 0))
        val api = FakeAuthApi(session()).apply { sessionResponse = { throw IOException("offline") } }
        val repository = AuthRepository(api, cookies, now = { 0 }, homeSnapshots = HomeSnapshotRepository(store, now = { 0 }))
        repository.prepareStartup(origin)

        assertFailsWith<IOException> { repository.restoreSavedSession(origin) }

        assertEquals("ada", repository.displayUser.value?.username)
        assertNull(repository.currentSession())
        assertFalse(repository.sessionExpired.value)
        assertEquals(SessionRefreshState.Unavailable, repository.refreshState.value)
        assertFailsWith<SessionRefreshUnavailableException> { repository.accessToken(origin) }
        assertEquals("ada", store.snapshot?.user?.username)
        assertTrue(cookies.read(origin).isNotEmpty())
    }

    @Test
    fun signOutInvalidatesACachedAccountAndPreventsPendingRestorationFromResurrectingIt() = runTest {
        val origin = "https://omicron.blog"
        val cookies = FakeSessionCookieStore().apply { write(origin, listOf(StoredSessionCookie("session", "saved", null))) }
        val store = FakeHomeSnapshotStore(HomeSnapshot(origin, AuthenticatedUser("user-1", "ada@example.com", "ada", "Ada"), 0))
        val gate = CompletableDeferred<AuthSessionDto?>()
        val api = FakeAuthApi(session()).apply { sessionResponse = { gate.await() } }
        val repository = AuthRepository(api, cookies, now = { 0 }, homeSnapshots = HomeSnapshotRepository(store, now = { 0 }))
        repository.prepareStartup(origin)
        val restoration = async { repository.restoreSavedSession(origin) }
        testScheduler.runCurrent()

        val signOut = async { repository.signOut(origin) }
        testScheduler.runCurrent()
        assertNull(repository.displayUser.value)
        assertNull(store.snapshot)
        gate.complete(session())
        testScheduler.advanceUntilIdle()
        signOut.await()

        assertTrue(restoration.isCancelled)
        assertNull(repository.currentSession())
        assertNull(store.snapshot)
        assertTrue(cookies.read(origin).isEmpty())
    }
}

private class FakeSessionCookieStore : SessionCookieStore {
    private val cookies = mutableMapOf<String, List<StoredSessionCookie>>()

    override suspend fun read(origin: String): List<StoredSessionCookie> = cookies[origin].orEmpty()

    override suspend fun write(origin: String, cookies: List<StoredSessionCookie>) {
        this.cookies[origin] = cookies
    }
}

private class FakeAuthApi(
    var session: AuthSessionDto?,
    private val signInFailure: Throwable? = null,
    private val signUpToken: String? = "session-token",
    private val createSessionOnSignIn: Boolean = true,
    private val signOutFailure: Throwable? = null,
    var tokenFailure: Throwable? = null,
) : AuthApi {
    var accessToken = "signed-token"
    var tokenRequests = 0
    var sessionResponse: (suspend () -> AuthSessionDto?)? = null

    override suspend fun getSession(origin: String): AuthSessionDto? {
        val response = sessionResponse
        return if (response == null) session else response()
    }

    override suspend fun getToken(origin: String): AuthTokenDto {
        tokenRequests += 1
        tokenFailure?.let { throw it }
        return AuthTokenDto(accessToken)
    }

    override suspend fun signInEmail(origin: String, email: String, password: String): AuthSessionCreationDto {
        signInFailure?.let { throw it }
        if (createSessionOnSignIn) session = session()
        return creation()
    }

    override suspend fun signInUsername(origin: String, username: String, password: String): AuthSessionCreationDto {
        signInFailure?.let { throw it }
        if (createSessionOnSignIn) session = session()
        return creation()
    }

    override suspend fun signUpEmail(
        origin: String,
        email: String,
        password: String,
        username: String,
        displayName: String,
    ): AuthSessionCreationDto {
        if (signUpToken != null) session = session()
        return creation(signUpToken)
    }

    override suspend fun signOut(origin: String) {
        signOutFailure?.let { throw it }
    }
}

private fun session() =
    AuthSessionDto(
        user = AuthUserDto(id = "user-1", email = "ada@example.com", username = "ada", displayName = "Ada"),
        session = buildJsonObject {},
    )

private fun creation(token: String? = "session-token") = AuthSessionCreationDto(user = session().user, token = token)
