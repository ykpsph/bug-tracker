package com.bugtracker.repository;

import com.bugtracker.model.Bug;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface BugRepository extends JpaRepository<Bug, Long> {
    List<Bug> findByStatus(String status);
    List<Bug> findByPriority(String priority);
    List<Bug> findByAssignedTo(String assignedTo);
}