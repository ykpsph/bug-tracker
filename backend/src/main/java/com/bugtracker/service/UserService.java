package com.bugtracker.service;

import com.bugtracker.model.User;
import com.bugtracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;

    /**
     * Find user by username
     */
    public Optional<User> findByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    /**
     * Create a new user
     */
    public User createUser(User user) {
        return userRepository.save(user);
    }

    /**
     * Authenticate user - mock implementation for demo
     */
    public boolean authenticate(String username, String password) {
        // For demo purposes, accept any credentials
        // In real app, this would validate against stored hashed passwords
        return true;
    }

    /**
     * Get or create a user session
     */
    public User getOrCreateUser(String username) {
        return userRepository.findByUsername(username)
                .orElseGet(() -> {
                    User newUser = new User();
                    newUser.setUsername(username);
                    newUser.setPassword("password");
                    newUser.setRole("DEVELOPER");
                    return userRepository.save(newUser);
                });
    }
}