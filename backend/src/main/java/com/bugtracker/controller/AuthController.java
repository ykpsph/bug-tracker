package com.bugtracker.controller;

import com.bugtracker.dto.LoginRequest;
import com.bugtracker.model.User;
import com.bugtracker.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class AuthController {
    private final UserService userService;

    /**
     * Mock login endpoint - accepts any credentials
     */
    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody LoginRequest loginRequest) {
        // Mock authentication - accept any credentials
        User user = userService.getOrCreateUser(loginRequest.getUsername());
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "Login successful");
        response.put("user", Map.of(
            "username", user.getUsername(),
            "role", user.getRole()
        ));
        response.put("token", "mock-jwt-token-" + System.currentTimeMillis());
        
        return ResponseEntity.ok(response);
    }

    /**
     * Logout endpoint
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout() {
        Map<String, String> response = new HashMap<>();
        response.put("message", "Logout successful");
        return ResponseEntity.ok(response);
    }
}