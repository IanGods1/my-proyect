package com.casematch.app.util

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * Hash de contraseñas con PBKDF2-HMAC-SHA256 y sal aleatoria.
 * Las contraseñas nunca se guardan en texto plano.
 */
object PasswordHasher {
    const val DEFAULT_ITERATIONS = 60_000
    private const val KEY_BITS = 256
    private const val PREFIX = "pbkdf2"

    fun newSalt(): String {
        val bytes = ByteArray(16)
        SecureRandom().nextBytes(bytes)
        return bytes.toHex()
    }

    /** Clave derivada (hex) de la contraseña con la sal indicada. Siempre da el mismo resultado. */
    fun derive(password: String, saltHex: String, iterations: Int = DEFAULT_ITERATIONS): String {
        val spec = PBEKeySpec(password.toCharArray(), saltHex.hexToBytes(), iterations, KEY_BITS)
        try {
            val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            return factory.generateSecret(spec).encoded.toHex()
        } finally {
            spec.clearPassword()
        }
    }

    /** Texto para guardar: "pbkdf2$iteraciones$sal$hash". */
    fun hashForStorage(password: String, iterations: Int = DEFAULT_ITERATIONS): String {
        val salt = newSalt()
        return listOf(PREFIX, iterations.toString(), salt, derive(password, salt, iterations)).joinToString("$")
    }

    fun verify(password: String, stored: String?): Boolean {
        val parts = stored?.split("$") ?: return false
        if (parts.size != 4 || parts[0] != PREFIX) return false
        val iterations = parts[1].toIntOrNull() ?: return false
        val expected = parts[3]
        val actual = derive(password, parts[2], iterations)
        return MessageDigest.isEqual(expected.toByteArray(), actual.toByteArray())
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it.toInt() and 0xff) }

    private fun String.hexToBytes(): ByteArray =
        ByteArray(length / 2) { i -> substring(i * 2, i * 2 + 2).toInt(16).toByte() }
}
