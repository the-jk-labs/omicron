package org.omicron.mobile.data.repository

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import org.omicron.mobile.data.api.AuthApi
import org.omicron.mobile.data.api.AuthApiException
import org.omicron.mobile.data.api.AuthSessionDto
import org.omicron.mobile.data.api.AuthSessionCreationDto
import org.omicron.mobile.data.api.AuthTokenDto
import org.omicron.mobile.data.api.AuthUserDto
import org.omicron.mobile.core.storage.SessionCookieStore
import org.omicron.mobile.core.storage.StoredSessionCookie
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

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
) : AuthApi {
    var accessToken = "signed-token"
    var tokenRequests = 0

    override suspend fun getSession(origin: String): AuthSessionDto? = session

    override suspend fun getToken(origin: String): AuthTokenDto {
        tokenRequests += 1
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
