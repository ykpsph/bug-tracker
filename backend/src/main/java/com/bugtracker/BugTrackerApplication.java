package com.bugtracker;

import com.bugtracker.model.Bug;
import com.bugtracker.model.User;
import com.bugtracker.repository.BugRepository;
import com.bugtracker.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;

import java.time.LocalDateTime;

@SpringBootApplication(exclude = SecurityAutoConfiguration.class)
public class BugTrackerApplication {
    public static void main(String[] args) {
        SpringApplication.run(BugTrackerApplication.class, args);
    }

    @Bean
    public CommandLineRunner initData(BugRepository bugRepository, 
                                      UserRepository userRepository,
                                      Environment env) {
        return args -> {
            // Sadece development ortamında test verisi ekle
            String[] activeProfiles = env.getActiveProfiles();
            boolean isDev = activeProfiles.length == 0 || 
                           "dev".equals(activeProfiles[0]) ||
                           "default".equals(activeProfiles[0]);
            
            if (!isDev) {
                System.out.println("ℹ️ Production mode - skipping test data");
                return;
            }

            // Test kullanıcıları oluştur
            if (userRepository.count() == 0) {
                User user1 = new User();
                user1.setUsername("admin");
                user1.setPassword("password");
                user1.setRole("ADMIN");
                userRepository.save(user1);

                User user2 = new User();
                user2.setUsername("developer");
                user2.setPassword("password");
                user2.setRole("DEVELOPER");
                userRepository.save(user2);

                System.out.println("✅ Test kullanıcıları oluşturuldu!");
            }

            // Test bug'ları oluştur
            if (bugRepository.count() == 0) {
                Bug bug1 = new Bug();
                bug1.setTitle("Login sayfası çalışmıyor");
                bug1.setDescription("Kullanıcı giriş yapamıyor, 500 hatası alınıyor");
                bug1.setStatus("OPEN");
                bug1.setPriority("CRITICAL");
                bug1.setAssignedTo("developer");
                bug1.setCreatedAt(LocalDateTime.now());
                bugRepository.save(bug1);

                Bug bug2 = new Bug();
                bug2.setTitle("Dashboard grafikleri gözükmüyor");
                bug2.setDescription("Chart.js yüklenmiyor, konsol hatası var");
                bug2.setStatus("IN_PROGRESS");
                bug2.setPriority("HIGH");
                bug2.setAssignedTo("admin");
                bug2.setCreatedAt(LocalDateTime.now());
                bugRepository.save(bug2);

                Bug bug3 = new Bug();
                bug3.setTitle("Mobil görünüm bozuk");
                bug3.setDescription("Telefon ekranında menüler düzgün görünmüyor");
                bug3.setStatus("OPEN");
                bug3.setPriority("MEDIUM");
                bug3.setAssignedTo(null);
                bug3.setCreatedAt(LocalDateTime.now());
                bugRepository.save(bug3);

                Bug bug4 = new Bug();
                bug4.setTitle("Veritabanı bağlantı hatası");
                bug4.setDescription("Prod ortamında connection timeout alınıyor");
                bug4.setStatus("RESOLVED");
                bug4.setPriority("HIGH");
                bug4.setAssignedTo("developer");
                bug4.setCreatedAt(LocalDateTime.now());
                bugRepository.save(bug4);

                System.out.println("✅ Test bug'ları oluşturuldu!");
            }
        };
    }
}