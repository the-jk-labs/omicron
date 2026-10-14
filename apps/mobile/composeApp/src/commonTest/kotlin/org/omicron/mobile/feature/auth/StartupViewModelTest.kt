package org.omicron.mobile.feature.auth

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.omicron.mobile.core.storage.SessionCookieStore
import org.omicron.mobile.core.storage.StoredSessionCookie
import org.omicron.mobile.data.api.KtorAuthApi
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.data.repository.SessionRefreshState
import org.omicron.mobile.domain.model.InstanceConfiguration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StartupViewModelTest {
    @Test
    fun opensHomeBeforeNetworkSessionRestorationCompletes() = runTest {
        Fixture(this).use { fixture ->
            val gate = CompletableDeferred<Unit>()
            fixture.sessionGate = gate
            val viewModel = fixture.viewModel(this)
            testScheduler.runCurrent()

            assertIs<StartupPhase.Ready>(viewModel.uiState.value)
            assertEquals(SessionRefreshState.Restoring, fixture.auth.refreshState.value)
            assertNull(fixture.auth.currentSession())
            gate.complete(Unit)
            testScheduler.advanceUntilIdle()

            assertTrue(assertIs<StartupPhase.Ready>(viewModel.uiState.value).hasSavedInstance)
            assertEquals("fresh-token", fixture.auth.currentSession()?.accessToken)
            assertEquals(listOf("/api/auth/get-session", "/api/auth/token"), fixture.requests)
            viewModel.close()
        }
    }

    @Test
    fun firstLaunchChoosesConnectionWithoutAuthenticationRequests() = runTest {
        Fixture(this).use { fixture ->
            fixture.instance = null
            val viewModel = fixture.viewModel(this)
            testScheduler.advanceUntilIdle()

            assertFalse(assertIs<StartupPhase.Ready>(viewModel.uiState.value).hasSavedInstance)
            assertTrue(fixture.requests.isEmpty())
            viewModel.close()
        }
    }

    @Test
    fun guestsWithASavedInstanceSkipNetworkRestoration() = runTest {
        Fixture(this).use { fixture ->
            fixture.cookies.clear(origin)
            val viewModel = fixture.viewModel(this)
            testScheduler.advanceUntilIdle()

            assertTrue(assertIs<StartupPhase.Ready>(viewModel.uiState.value).hasSavedInstance)
            assertNull(fixture.auth.currentSession())
            assertTrue(fixture.requests.isEmpty())
            viewModel.close()
        }
    }

    @Test
    fun expiredCookiesDoNotRequireANetworkCheck() = runTest {
        Fixture(this).use { fixture ->
            fixture.cookies.write(origin, listOf(StoredSessionCookie("session", "expired", 999)))
            val viewModel = fixture.viewModel(this)
            testScheduler.advanceUntilIdle()

            assertIs<StartupPhase.Ready>(viewModel.uiState.value)
            assertTrue(fixture.requests.isEmpty())
            viewModel.close()
        }
    }

    @Test
    fun cookiesFromAnotherOriginAreNotRestored() = runTest {
        Fixture(this).use { fixture ->
            fixture.instance = savedConfiguration.copy(origin = "https://other.example")
            val viewModel = fixture.viewModel(this)
            testScheduler.advanceUntilIdle()

            assertIs<StartupPhase.Ready>(viewModel.uiState.value)
            assertTrue(fixture.requests.isEmpty())
            assertEquals(listOf(savedCookie), fixture.cookies.read(origin))
            viewModel.close()
        }
    }

    @Test
    fun offlineRestorationRetainsCookiesAndCanBeRetried() = runTest {
        Fixture(this).use { fixture ->
            fixture.offline = true
            val viewModel = fixture.viewModel(this)
            testScheduler.advanceUntilIdle()

            assertTrue(assertIs<StartupPhase.Ready>(viewModel.uiState.value).hasSavedInstance)
            assertEquals(SessionRefreshState.Unavailable, fixture.auth.refreshState.value)
            assertEquals(listOf(savedCookie), fixture.cookies.read(origin))
            fixture.offline = false
            viewModel.restore()
            testScheduler.advanceUntilIdle()

            assertIs<StartupPhase.Ready>(viewModel.uiState.value)
            assertEquals("ada", fixture.auth.currentSession()?.user?.username)
            viewModel.close()
        }
    }

    @Test
    fun failedRefreshKeepsHomeReadyAndRetainsCookies() = runTest {
        Fixture(this).use { fixture ->
            fixture.offline = true
            val viewModel = fixture.viewModel(this)
            testScheduler.advanceUntilIdle()

            assertTrue(assertIs<StartupPhase.Ready>(viewModel.uiState.value).hasSavedInstance)
            assertEquals(listOf(savedCookie), fixture.cookies.read(origin))
            assertNull(fixture.auth.currentSession())
            viewModel.close()
        }
    }

    @Test
    fun missingServerSessionsClearStaleCookiesAndOpenGuestHome() = runTest {
        Fixture(this).use { fixture ->
            fixture.sessionExists = false
            val viewModel = fixture.viewModel(this)
            testScheduler.advanceUntilIdle()

            assertTrue(assertIs<StartupPhase.Ready>(viewModel.uiState.value).hasSavedInstance)
            assertTrue(fixture.cookies.read(origin).isEmpty())
            assertNull(fixture.auth.currentSession())
            viewModel.close()
        }
    }

    @Test
    fun revokedSessionsClearStaleCookiesAndOpenGuestHome() = runTest {
        Fixture(this).use { fixture ->
            fixture.tokenUnauthorized = true
            val viewModel = fixture.viewModel(this)
            testScheduler.advanceUntilIdle()

            assertTrue(assertIs<StartupPhase.Ready>(viewModel.uiState.value).hasSavedInstance)
            assertTrue(fixture.cookies.read(origin).isEmpty())
            assertNull(fixture.auth.currentSession())
            viewModel.close()
        }
    }

    @Test
    fun instanceStorageErrorsRequireRecoveryRatherThanMasqueradingAsFirstLaunch() = runTest {
        Fixture(this).use { fixture ->
            fixture.instanceReadFails = true
            val viewModel = fixture.viewModel(this)
            testScheduler.advanceUntilIdle()

            assertFalse(assertIs<StartupPhase.Error>(viewModel.uiState.value).hasSavedInstance)
            viewModel.continueAsGuest()
            assertIs<StartupPhase.Error>(viewModel.uiState.value)
            viewModel.chooseInstance()
            assertFalse(assertIs<StartupPhase.Ready>(viewModel.uiState.value).hasSavedInstance)
            viewModel.close()
        }
    }

    @Test
    fun closingDuringRestorationDoesNotTurnCancellationIntoAnErrorOrGuestState() = runTest {
        Fixture(this).use { fixture ->
            fixture.sessionGate = CompletableDeferred()
            val viewModel = fixture.viewModel(this)
            testScheduler.runCurrent()

            viewModel.close()
            testScheduler.advanceUntilIdle()

            assertIs<StartupPhase.Ready>(viewModel.uiState.value)
            assertEquals(listOf(savedCookie), fixture.cookies.read(origin))
        }
    }
}

private const val origin = "https://omicron.blog"
private val savedCookie = StoredSessionCookie("session", "saved-session", null)
private val savedConfiguration = InstanceConfiguration(origin, "Omicron", "omicron.blog", true, true, true, true)

private class Fixture(testScope: TestScope) : AutoCloseable {
    var instance: InstanceConfiguration? = savedConfiguration
    var instanceReadFails = false
    var offline = false
    var sessionExists = true
    var tokenUnauthorized = false
    var sessionGate: CompletableDeferred<Unit>? = null
    val requests = mutableListOf<String>()
    val cookies = object : SessionCookieStore {
        private val stored = mutableMapOf(origin to listOf(savedCookie))
        override suspend fun read(origin: String) = stored[origin].orEmpty()
        override suspend fun write(origin: String, cookies: List<StoredSessionCookie>) {
            stored[origin] = cookies
        }
    }
    private val client = HttpClient(MockEngine) {
        engine {
            dispatcher = StandardTestDispatcher(testScope.testScheduler)
            addHandler { request ->
                assertEquals(origin, "${request.url.protocol.name}://${request.url.host}")
                val path = request.url.encodedPath
                requests += path
                when {
                    offline -> respond("{}", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType, "application/json"))
                    path == "/api/auth/get-session" -> {
                        sessionGate?.await()
                        respond(
                            if (sessionExists) """{"user":{"id":"ada","email":"ada@example.com","username":"ada","name":"Ada"},"session":{}}""" else "null",
                            headers = headersOf(HttpHeaders.ContentType, "application/json"),
                        )
                    }
                    tokenUnauthorized -> respond("""{"code":"UNAUTHORIZED"}""", HttpStatusCode.Unauthorized, headersOf(HttpHeaders.ContentType, "application/json"))
                    else -> respond("""{"token":"fresh-token"}""", headers = headersOf(HttpHeaders.ContentType, "application/json"))
                }
            }
        }
        expectSuccess = true
        install(ContentNegotiation) { json() }
    }
    val auth = AuthRepository(KtorAuthApi(client), cookies, now = { 1_000 })

    fun viewModel(scope: TestScope) = StartupViewModel(
        savedInstance = {
            check(!instanceReadFails)
            instance
        },
        repository = auth,
        scope = TestScope(StandardTestDispatcher(scope.testScheduler)),
    )

    override fun close() = client.close()
}
